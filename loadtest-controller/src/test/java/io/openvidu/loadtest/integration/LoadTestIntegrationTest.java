package io.openvidu.loadtest.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verify;
import io.openvidu.loadtest.integration.mock.BrowserEmulatorMockServer;
import io.openvidu.loadtest.integration.mock.WebSocketMockServer;
import io.openvidu.loadtest.utils.ShutdownManager;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.select.Elements;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Integration test for loadtest-controller that runs a full test with mocked
 * browser-emulator.
 * This test starts the loadtest-controller application with mocked HTTP and
 * WebSocket servers
 * simulating browser-emulator instances, and validates the generated HTML and
 * TXT reports.
 */
@SpringBootTest(classes = { io.openvidu.loadtest.LoadTestApplication.class,
        io.openvidu.loadtest.integration.config.IntegrationTestConfig.class }, webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "LOADTEST_CONFIG=integration/config/smoke-test-integration-config.yaml"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class LoadTestIntegrationTest {

    // Mock servers
    private static BrowserEmulatorMockServer browserEmulatorMock;
    private static WebSocketMockServer webSocketMock;

    @MockitoBean
    private ShutdownManager shutdownManagerMock;

    // Results directory
    private static Path resultsDir;

    static {
        // Set RESULTS_DIR BEFORE Spring context loads so HtmlReportGenerator can find
        // it
        resultsDir = Path.of("target/test-results/integration");
        System.setProperty("RESULTS_DIR", resultsDir.toAbsolutePath().toString());

        // Configure SSL to trust all certificates for testing BEFORE Spring context
        // loads
        try {
            configureTrustingSslContext();
        } catch (Exception e) {
            throw new RuntimeException("Failed to configure SSL", e);
        }
    }

    /**
     * Configure an SSL context that trusts all certificates.
     * This is for testing purposes only.
     */
    private static void configureTrustingSslContext() throws Exception {
        // Create a TrustManager that trusts all certificates
        javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                new javax.net.ssl.X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return null;
                    }

                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                        // Empty for testing
                    }

                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                        // Empty for testing
                    }
                }
        };

        // Install the all-trusting trust manager
        javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
        sc.init(null, trustAllCerts, new java.security.SecureRandom());
        javax.net.ssl.SSLContext.setDefault(sc);

        // Also set the system property for the default SSL socket factory
        javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
        javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
    }

    /**
     * Set up mock servers and environment.
     * HTTP server uses HTTPS with self-signed certificate.
     * WebSocket server uses plain HTTP (ws://) as WebSocket doesn't carry sensitive
     * data.
     */
    private static void setupMockServers() throws Exception {
        // Start WebSocket mock server with plain HTTP (ws://)
        webSocketMock = new WebSocketMockServer(5001);
        webSocketMock.start();

        // Start HTTP mock server with HTTPS
        browserEmulatorMock = new BrowserEmulatorMockServer(5000);
        browserEmulatorMock.setWebSocketServer(webSocketMock);
        browserEmulatorMock.startHttps();
    }

    @BeforeAll
    static void setUpEnvironmentAndStartMockServers() throws Exception {
        // Create results directory (RESULTS_DIR is already set in static block)
        Files.createDirectories(resultsDir);

        // Start mock servers
        setupMockServers();

        // Wait a moment for servers to be ready
        Thread.sleep(500);
    }

    @AfterAll
    static void stopMockServers() {
        if (browserEmulatorMock != null) {
            browserEmulatorMock.stop();
        }
        if (webSocketMock != null) {
            webSocketMock.stop();
        }
        // Clean up system property so other tests work correctly
        System.clearProperty("RESULTS_DIR");
    }

    @AfterEach
    void cleanup() throws IOException {
        if (resultsDir != null && Files.exists(resultsDir)) {
            Files.walk(resultsDir)
                    .sorted((a, b) -> b.compareTo(a)) // delete children before parents
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            // Log or rethrow as needed
                            throw new RuntimeException("Failed to delete " + path, e);
                        }
                    });
            Files.createDirectories(resultsDir); // recreate empty dir for next test
        }

        // Reset mock server request counts before each test
        if (browserEmulatorMock != null) {
            browserEmulatorMock.resetRequestCount();
        }
    }

    @RepeatedTest(5)
    void testBasicNNTopologyGeneratesCorrectReports() throws Exception {
        // The test runs automatically via @EventListener in LoadTestApplication
        // Wait for test completion - both HTML and TXT reports should be generated

        Path htmlReport = resultsDir.resolve("report.html");
        Path txtReport = resultsDir.resolve("results.txt");

        // Wait for reports to be generated with valid user data (max 30 seconds)
        boolean reportsReady = false;
        long startTime = System.currentTimeMillis();
        long timeoutMillis = 30_000; // 30 seconds

        while (!reportsReady && (System.currentTimeMillis() - startTime) < timeoutMillis) {
            if (Files.exists(htmlReport) && Files.exists(txtReport)) {
                // Verify the report has actual user data (not just the file exists)
                // Add a small delay to ensure file is fully written
                Thread.sleep(100);
                try {
                    String content = Files.readString(htmlReport);
                    if (!content.isEmpty()) {
                        reportsReady = true;
                        break;
                    }
                } catch (Exception e) {
                    // File might be in use, retry
                }
            }
            Thread.sleep(500); // Check every 500ms
        }

        assertTrue(reportsReady, "Reports should be generated within 30 seconds");

        // Validate HTML report
        validateHtmlReport(htmlReport);

        // Validate TXT report
        validateTxtReport(txtReport);

        // Verify that our mocks were called appropriately
        assertTrue(browserEmulatorMock.getRequestCount() >= 4,
                "Should have received at least 4 requests (ping, init, 2x streamManager, shutdown)");

        verify(shutdownManagerMock).shutdownWithCode(0);
    }

    private void validateHtmlReport(Path htmlReport) throws IOException {
        // Read the HTML content
        String content = Files.readString(htmlReport);

        // Parse with Jsoup for easier validation
        Document doc = Jsoup.parse(content);

        // Check basic HTML structure
        assertTrue(content.contains("<!DOCTYPE html>"), "Should have DOCTYPE");
        assertTrue(content.contains("<title>OpenVidu Load Test Report</title>"),
                "Should have correct title");
        assertTrue(content.contains("header-title") || content.contains("OpenVidu Load Test Report</h1>"),
                "Should have main heading");

        // Check Summary section using table ID
        Elements summaryTable = doc.select("#summary-table");
        assertFalse(summaryTable.isEmpty(), "Summary table with id='summary-table' should exist");
        Elements summaryRows = summaryTable.select("tr");

        Set<String> metricsFound = new HashSet<>();
        Set<String> expectedMetrics = Set.of("Test Duration", "Sessions Created", "Sessions Completed",
                "Total Participants", "Workers Used",
                "Stop Reason");

        for (var row : summaryRows) {
            String metric = row.select("td.metric").text();
            String value = row.select("td.value").text();

            metricsFound.add(metric);

            if (metric.equals("Sessions Created")) {
                assertEquals("1", value, "Sessions Created should be 1");
            }
            if (metric.equals("Total Participants")) {
                assertEquals("2", value, "Total Participants should be 2");
            }
            if (metric.equals("Workers Used")) {
                assertEquals("1", value, "Workers Used should be 1");
            }
            if (metric.equals("Stop Reason")) {
                assertFalse(value.isEmpty(), "Stop Reason should not be empty");
            }
        }
        assertTrue(metricsFound.containsAll(expectedMetrics),
                "Summary section should contain all expected metrics: " + expectedMetrics + ", found: " + metricsFound);

        // Check Configuration section using table ID
        Elements configTable = doc.select("#configuration-table");
        assertFalse(configTable.isEmpty(), "Configuration table with id='configuration-table' should exist");
        Elements configRows = configTable.select("tr");

        Set<String> configMetricsFound = new HashSet<>();
        Set<String> expectedConfigMetrics = Set.of("Session Topology", "Participants per Session", "Users per Worker");

        for (var row : configRows) {
            String metric = row.select("td.metric").text();
            String value = row.select("td.value").text();
            configMetricsFound.add(metric);

            if (metric.equals("Session Topology")) {
                assertTrue(value.startsWith("N:N"), "Session Topology should start with N:N, but was: " + value);
            }
            if (metric.equals("Participants per Session")) {
                assertEquals("2", value, "Participants per Session should be 2");
            }

            if (metric.equals("Users per Worker")) {
                assertEquals("2", value, "Users per Worker should be 2");
            }
        }
        assertTrue(configMetricsFound.contains("Session Topology"),
                "Configuration should contain Session Topology, found: " + configMetricsFound);
        assertTrue(configMetricsFound.contains("Participants per Session"),
                "Configuration should contain Participants per Session, found: " + configMetricsFound);
        // Check User Connections section using table ID
        Elements userTable = doc.select("#user-connections-table");
        assertFalse(userTable.isEmpty(), "User Connections table with id='user-connections-table' should exist");

        Elements userHeaders = userTable.select("th");
        assertTrue(userHeaders.size() >= 5, "User Connections table should have at least 5 columns");

        // Verify all required column headers are present
        List<String> headers = userHeaders.eachText();
        assertTrue(headers.stream().anyMatch(h -> h.contains("User")), "Should have User column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Session")), "Should have Session column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Join Date")), "Should have Join Date column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Retries")), "Should have Retries column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Retry Details")), "Should have Retry Details column: " + headers);
        assertFalse(headers.stream().anyMatch(h -> h.contains("Disconnect Date")), "Disconnect Date column should not be present: " + headers);

        // Get user data rows (exclude header row)
        Elements userRows = userTable.select("tr.user-row");

        // Extract all user IDs from the table
        List<String> userIds = new ArrayList<>();
        for (var row : userRows) {
            String firstCell = row.select("td:first-child").text();
            if (!firstCell.isEmpty() && !firstCell.equals("No participants")) {
                userIds.add(firstCell);
            }
        }

        // Both users must be present
        assertTrue(userIds.contains("User1"), "User1 should be present, found: " + userIds);
        assertTrue(userIds.contains("User2"), "User2 should be present, found: " + userIds);
        for (var row : userRows) {
            Elements cells = row.select("td");
            if (cells.size() >= 5) {
                String session = cells.get(1).text();
                String joinDate = cells.get(2).text();
                String retryNumber = cells.get(3).text();
                String retryDetails = cells.get(4).text();

                // Verify session name format
                assertEquals("LoadTestSession1", session, "Session name should be LoadTestSession1");

                // Verify join date format (yyyy-MM-dd HH:mm:ss)
                assertTrue(joinDate.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}"),
                        "Join date should be in yyyy-MM-dd HH:mm:ss format, was: " + joinDate);

                // Verify retry number is 0 (no reconnections)
                assertEquals("0", retryNumber, "Retry number should be 0");
                assertEquals("-", retryDetails, "Retry details should be '-' for users without retry attempts");
            }

            // Verify it's valid HTML
            assertFalse(doc.toString().isEmpty(), "HTML document should not be empty");
        }
    }

    private void validateTxtReport(Path txtReport) throws IOException {
        // Read the TXT content
        String content = Files.readString(txtReport);

        // Based on e2e smoke test validation patterns
        assertTrue(content.contains("Test Case Report"),
                "Should contain Test Case Report header");
        assertTrue(content.contains("Number of sessions created: 1"),
                "Should show 1 session created");
        assertTrue(content.contains("Number of participants created: 2"),
                "Should show 2 participants created");
        assertTrue(content.contains("User start times:"),
                "Should contain user start times section");

        boolean hasUser1 = content.matches("(?s).*\\| LoadTestSession1 \\| User1.*");
        boolean hasUser2 = content.matches("(?s).*\\| LoadTestSession1 \\| User2.*");
        assertTrue(hasUser1, "Should contain User1");
        assertTrue(hasUser2, "Should contain User2");

        // Should have stop reason
        assertTrue(content.contains("Stop reason:"),
                "Should contain stop reason");

        // Verify it's not empty
        assertFalse(content.trim().isEmpty(), "TXT report should not be empty");
    }
}
