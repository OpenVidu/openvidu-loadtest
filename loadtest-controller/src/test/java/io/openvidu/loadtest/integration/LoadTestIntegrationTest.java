package io.openvidu.loadtest.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verify;
import io.openvidu.loadtest.integration.mock.BrowserEmulatorMockServer;
import io.openvidu.loadtest.integration.mock.WebSocketMockServer;
import io.openvidu.loadtest.utils.ShutdownManager;

import java.io.IOException;
import java.nio.file.FileSystems;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
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
        // Start WebSocket mock server with plain HTTP (ws://) on ephemeral port
        webSocketMock = new WebSocketMockServer(0);
        webSocketMock.start();

        // Start HTTP mock server with HTTPS on ephemeral port
        browserEmulatorMock = new BrowserEmulatorMockServer(0);
        browserEmulatorMock.setWebSocketServer(webSocketMock);
        browserEmulatorMock.startHttps();

    }

    @DynamicPropertySource
    static void registerWorkerPorts(DynamicPropertyRegistry registry) {
        try {
            setupMockServers();
            registry.add("workers.http.port", () -> browserEmulatorMock.getPort());
            registry.add("workers.websocket.port", () -> webSocketMock.getPort());
        } catch (Exception e) {
            throw new RuntimeException("Failed to start mock servers for tests", e);
        }
    }

    @BeforeAll
    static void setUpEnvironmentAndStartMockServers() throws Exception {
        cleanupResultsDir();
        Files.createDirectories(resultsDir);
        // Mock servers started in @DynamicPropertySource
    }

    @AfterAll
    static void stopMockServers() {
        if (browserEmulatorMock != null) {
            browserEmulatorMock.stop();
        }
        if (webSocketMock != null) {
            webSocketMock.stop();
        }
        System.clearProperty("RESULTS_DIR");
    }

    @BeforeEach
    void setupBeforeTest() {
        if (browserEmulatorMock != null) {
            browserEmulatorMock.resetRequestCount();
        }
    }

    private static void cleanupResultsDir() throws IOException {
        if (resultsDir != null && Files.exists(resultsDir)) {
            Files.walk(resultsDir)
                    .sorted((a, b) -> b.compareTo(a))
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            throw new RuntimeException("Failed to delete " + path, e);
                        }
                    });
        }
    }

    @AfterEach
    void cleanup() {
        // Reset mock server request counts before each test
        if (browserEmulatorMock != null) {
            browserEmulatorMock.resetRequestCount();
        }
    }

    @RepeatedTest(5)
    void testBasicNNTopologyGeneratesCorrectReports() throws Exception {
        // The test runs automatically via @EventListener in LoadTestApplication
        // Wait for test completion - both HTML and TXT reports should be generated

        Path txtReport = findLatestFile(resultsDir, "results-*.txt");
        Path htmlReport = findLatestFile(resultsDir, "report-*.html");

        // Validate HTML report
        validateHtmlReport(htmlReport);

        // Validate TXT report
        validateTxtReport(txtReport);

        verify(shutdownManagerMock).shutdownWithCode(0);
    }

    private Path findLatestFile(Path dir, String pattern) throws IOException {
        var matcher = FileSystems.getDefault().getPathMatcher("glob:" + pattern);
        Path latest = null;
        try (var stream = Files.list(dir)) {
            for (Path path : stream.toList()) {
                if (matcher.matches(path.getFileName()) && (latest == null || Files.getLastModifiedTime(path).toMillis() > Files.getLastModifiedTime(latest).toMillis())) {
                    latest = path;
                }
            }
        }
        assert latest != null : "No file matching pattern " + pattern + " found in " + dir;
        return latest;
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
        Elements summaryTable = doc.select("#summary-table, #summary-table-1");
        assertFalse(summaryTable.isEmpty(), "Summary table with id='summary-table' or '#summary-table-1' should exist");
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
        Elements configTable = doc.select("#configuration-table, #configuration-table-1");
        assertFalse(configTable.isEmpty(),
                "Configuration table with id='configuration-table' or '#configuration-table-1' should exist");
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
        Elements userTable = doc.select("#user-connections-table, #user-connections-table-1");
        assertFalse(userTable.isEmpty(), "User Connections table should exist");

        Elements userHeaders = userTable.select("th");
        assertTrue(userHeaders.size() >= 6, "User Connections table should have at least 6 columns");

        // Verify all required column headers are present
        List<String> headers = userHeaders.eachText();
        assertTrue(headers.stream().anyMatch(h -> h.contains("User")), "Should have User column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Session")), "Should have Session column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Type")), "Should have Type column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Join Date")), "Should have Join Date column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Retries")), "Should have Retries column: " + headers);
        assertTrue(headers.stream().anyMatch(h -> h.contains("Retry Details")),
                "Should have Retry Details column: " + headers);
        assertFalse(headers.stream().anyMatch(h -> h.contains("Disconnect Date")),
                "Disconnect Date column should not be present: " + headers);

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
            if (cells.size() >= 6) {
                String session = cells.get(1).text();
                String type = cells.get(2).text();
                String joinDate = cells.get(3).text();
                String retryNumber = cells.get(4).text();
                String retryDetails = cells.get(5).text();

                // For N:N topology (smoke test) all users should be PUBLISHER
                assertEquals("PUBLISHER", type, "Type should be PUBLISHER for N:N topology");

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
