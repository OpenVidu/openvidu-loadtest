package io.openvidu.loadtest.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verify;
import io.openvidu.loadtest.integration.mock.BrowserEmulatorMockServer;
import io.openvidu.loadtest.integration.mock.WebSocketMockServer;
import io.openvidu.loadtest.utils.ShutdownManager;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.select.Elements;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Integration test for loadtest-controller that runs multiple test cases in a
 * single run.
 * This test validates the tabbed HTML report with Overview and per-test-case
 * tabs.
 */
@SpringBootTest(classes = { io.openvidu.loadtest.LoadTestApplication.class,
        io.openvidu.loadtest.integration.config.IntegrationTestConfig.class }, webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "LOADTEST_CONFIG=integration/config/multi-test-config.yaml"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class MultiTestCaseIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(MultiTestCaseIntegrationTest.class);

    private static BrowserEmulatorMockServer browserEmulatorMock;
    private static WebSocketMockServer webSocketMock;

    @MockitoBean
    private ShutdownManager shutdownManagerMock;

    private static Path resultsDir;

    static {
        resultsDir = Path.of("target/test-results/multi-test");
        System.setProperty("RESULTS_DIR", resultsDir.toAbsolutePath().toString());

        try {
            configureTrustingSslContext();
        } catch (Exception e) {
            throw new RuntimeException("Failed to configure SSL", e);
        }
    }

    private static void configureTrustingSslContext() throws Exception {
        javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                new javax.net.ssl.X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return null;
                    }

                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }

                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }
                }
        };

        javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
        sc.init(null, trustAllCerts, new java.security.SecureRandom());
        javax.net.ssl.SSLContext.setDefault(sc);
        javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
        javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
    }

    private static void setupMockServers() throws Exception {
        webSocketMock = new WebSocketMockServer(5001);
        webSocketMock.start();

        browserEmulatorMock = new BrowserEmulatorMockServer(5000);
        browserEmulatorMock.setWebSocketServer(webSocketMock);
        browserEmulatorMock.startHttps();
    }

    @BeforeAll
    static void setUpEnvironmentAndStartMockServers() throws Exception {
        Files.createDirectories(resultsDir);
        cleanupResultsDir();
        setupMockServers();
        Thread.sleep(500);
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
            Files.createDirectories(resultsDir);
        }
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

    @Test
    void testMultiTestCaseGeneratesTabbedReport() throws Exception {
        Path htmlReport = resultsDir.resolve("report.html");
        Path txtReport = resultsDir.resolve("results.txt");

        assertTrue(Files.exists(htmlReport), "HTML report should exist");
        assertTrue(Files.exists(txtReport), "TXT report should exist");

        validateMultiTestCaseHtmlReport(htmlReport);

        verify(shutdownManagerMock).shutdownWithCode(0);
    }

    private void validateMultiTestCaseHtmlReport(Path htmlReport) throws IOException {
        String content = Files.readString(htmlReport);
        Document doc = Jsoup.parse(content);

        assertTrue(content.contains("<!DOCTYPE html>"), "Should have DOCTYPE");
        assertTrue(content.contains("OpenVidu Load Test Report"), "Should have correct title");

        assertTrue(content.contains("tab-bar"), "Should have tab bar for multiple test cases");
        assertTrue(content.contains("Overview"), "Should have Overview tab");

        Elements tabButtons = doc.select(".tab-btn");
        assertTrue(tabButtons.size() >= 4,
                "Should have at least 4 tabs (Overview + 3 test cases), found: " + tabButtons.size());

        Elements tabContents = doc.select(".tab-content");
        assertTrue(tabContents.size() >= 4, "Should have at least 4 tab content panels, found: " + tabContents.size());

        Elements overviewTab = doc.select(".tab-content#tab-overview");
        assertFalse(overviewTab.isEmpty(), "Overview tab content should exist");

        Elements overviewStats = overviewTab.select(".stat-card");
        assertTrue(overviewStats.size() >= 3, "Overview should have stats cards: " + overviewStats.size());

        Elements comparisonTable = doc.select(".overview-table");
        assertFalse(comparisonTable.isEmpty(), "Comparison table should exist in Overview tab");

        Elements comparisonRows = comparisonTable.select("tbody tr");
        assertTrue(comparisonRows.size() >= 3,
                "Comparison table should have at least 3 rows (one per test case), found: " + comparisonRows.size());

        // Log all test case results for visibility
        for (var row : comparisonRows) {
            Elements cells = row.select("td");
            if (cells.size() >= 6) {
                String label = cells.get(1).text();
                String sessions = cells.get(4).text();
                String participants = cells.get(5).text();
                log.info("Test case '{}': sessions={}, participants={}", label, sessions, participants);
            }
        }

        boolean hasOverviewActive = false;
        for (var tab : doc.select(".tab-content#tab-overview")) {
            if (tab.hasClass("active")) {
                hasOverviewActive = true;
                break;
            }
        }
        assertTrue(hasOverviewActive, "Overview tab should be active by default");
    }
}