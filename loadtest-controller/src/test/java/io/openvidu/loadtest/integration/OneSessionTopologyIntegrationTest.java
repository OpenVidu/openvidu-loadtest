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
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.core.type.TypeReference;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
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

/**
 * Integration test for loadtest-controller that runs One Session topology test cases in a
 * single run.
 * This test validates the tabbed HTML report with Overview and per-test-case
 * tabs.
 */
@SpringBootTest(classes = { io.openvidu.loadtest.LoadTestApplication.class,
        io.openvidu.loadtest.integration.config.IntegrationTestConfig.class }, webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "LOADTEST_CONFIG=integration/config/one-session-test-config.yaml"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OneSessionTopologyIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(OneSessionTopologyIntegrationTest.class);

    private static BrowserEmulatorMockServer browserEmulatorMock;
    private static WebSocketMockServer webSocketMock;

    @MockitoBean
    private ShutdownManager shutdownManagerMock;

    private static Path resultsDir;

    static {
        resultsDir = Path.of("target/test-results/one-session-test");
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
    void testOneSessionTopologyGeneratesTabbedReport() throws Exception {
        Path htmlReport = resultsDir.resolve("report.html");
        Path txtReport = resultsDir.resolve("results.txt");

        assertTrue(Files.exists(htmlReport), "HTML report should exist");
        assertTrue(Files.exists(txtReport), "TXT report should exist");

        validateOneSessionTopologyHtmlReport(htmlReport);

        verify(shutdownManagerMock).shutdownWithCode(0);
    }

    private void validateOneSessionTopologyHtmlReport(Path htmlReport) throws IOException {
        String content = Files.readString(htmlReport);
        Document doc = Jsoup.parse(content);

        assertTrue(content.contains("<!DOCTYPE html>"), "Should have DOCTYPE");
        assertTrue(content.contains("OpenVidu Load Test Report"), "Should have correct title");

        assertTrue(content.contains("tab-bar"), "Should have tab bar for multiple test cases");
        assertTrue(content.contains("Overview"), "Should have Overview tab");

        Elements tabButtons = doc.select(".tab-btn");
        assertTrue(tabButtons.size() >= 3,
                "Should have at least 3 tabs (Overview + 2 test cases), found: " + tabButtons.size());

        Elements tabContents = doc.select(".tab-content");
        assertTrue(tabContents.size() >= 3, "Should have at least 3 tab content panels, found: " + tabContents.size());

        Elements overviewTab = doc.select(".tab-content#tab-overview");
        assertFalse(overviewTab.isEmpty(), "Overview tab content should exist");

        Elements overviewStats = overviewTab.select(".stat-card");
        assertTrue(overviewStats.size() >= 3, "Overview should have stats cards: " + overviewStats.size());

        Elements comparisonTable = doc.select(".overview-table");
        assertFalse(comparisonTable.isEmpty(), "Comparison table should exist in Overview tab");

        Elements comparisonRows = comparisonTable.select("tbody tr");
        assertTrue(comparisonRows.size() >= 2,
                "Comparison table should have at least 2 rows (one per test case), found: " + comparisonRows.size());

        // Parse the YAML test config to know expected participants for each test case
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
        try (InputStream is = getClass().getClassLoader()
                .getResourceAsStream("integration/config/one-session-test-config.yaml")) {
            Map<String, Object> cfg = mapper.readValue(is, new TypeReference<Map<String, Object>>() {
            });
            List<Map<String, Object>> testcases = (List<Map<String, Object>>) cfg.get("testcases");

            // Global capacity: distribution.usersPerWorker (if present)
            int usersPerWorkerFromCfg = 0;
            Object distributionObj = cfg.get("distribution");
            if (distributionObj instanceof Map) {
                Object upw = ((Map<?, ?>) distributionObj).get("usersPerWorker");
                if (upw instanceof Number) {
                    usersPerWorkerFromCfg = ((Number) upw).intValue();
                } else if (upw != null) {
                    usersPerWorkerFromCfg = Integer.parseInt(upw.toString());
                }
            }

            // Build expected values by topology from config
            Map<String, Integer> expectedParticipantsByTopology = new java.util.HashMap<>();
            List<String> expectedTopologyOrder = new ArrayList<>();
            for (Map<String, Object> tc : testcases) {
                String topology = tc.get("topology").toString();
                List<String> participantsList = (List<String>) tc.get("participants");
                String participantsSpec = participantsList.get(0);
                int expected = 0;
                if (participantsSpec.contains(":")) {
                    String[] parts = participantsSpec.split(":");
                    for (String p : parts) {
                        expected += Integer.parseInt(p.trim());
                    }
                } else {
                    expected = Integer.parseInt(participantsSpec.trim());
                }
                expectedParticipantsByTopology.put(topology, expected);
                expectedTopologyOrder.add(topology);
            }

            // For each overview row, assert the participants column matches the expected
            // total
            int validatedRows = 0;
            for (var row : comparisonRows) {
                Elements cells = row.select("td");
                if (cells.size() >= 7) {
                    String label = cells.get(1).text();
                    String sessionsCell = cells.get(4).text();
                    String participantsCell = cells.get(5).text();
                    String workersCell = cells.get(6).text();
                    // Stop reason is the last column in the overview table
                    String stopReasonCell = cells.size() >= 9 ? cells.get(8).text() : "";
                    log.info("Test case '{}': sessions={}, participants={}, workers={}, stopReason={}", label,
                            sessionsCell, participantsCell, workersCell, stopReasonCell);

                    String expectedTopology = null;
                    if (label.contains("ONE_SESSION_NXN")) {
                        expectedTopology = "ONE_SESSION_NXN";
                    } else if (label.contains("ONE_SESSION_NXM")) {
                        expectedTopology = "ONE_SESSION_NXM";
                    }

                    if (expectedTopology == null) {
                        continue;
                    }

                    Integer expectedTotalParticipants = expectedParticipantsByTopology.get(expectedTopology);
                    assertNotNull(expectedTotalParticipants,
                            "Missing expected participants for topology " + expectedTopology);

                    // Apply capacity cap if distribution.usersPerWorker is configured
                    int workersUsed = Integer.parseInt(workersCell.trim());
                    if (usersPerWorkerFromCfg > 0 && workersUsed > 0) {
                        expectedTotalParticipants = Math.min(expectedTotalParticipants,
                                usersPerWorkerFromCfg * workersUsed);
                    }

                    try {
                        int actualTotal = Integer.parseInt(participantsCell.trim());
                        assertEquals(expectedTotalParticipants, actualTotal,
                                "Total participants for test case does not match expected for: " + label);

                        assertEquals(expectedParticipantsByTopology.get(expectedTopology).intValue(), actualTotal,
                                "Explicit total participants expected for test case does not match: " + label);

                        if (expectedTopology.equals("ONE_SESSION_NXM")) {
                            assertEquals("Test finished", stopReasonCell,
                                    "Stop reason should be 'Test finished' for test case: " + label);
                        } else {
                            assertTrue(stopReasonCell.equals("Test finished")
                                            || stopReasonCell.equals("No more workers available"),
                                    "Unexpected stop reason for ONE_SESSION_NXN test case: " + stopReasonCell);
                        }
                    } catch (NumberFormatException nfe) {
                        fail("Participants cell is not a number for test case: " + label + " value: "
                                + participantsCell);
                    }
                    validatedRows++;
                }
            }
            assertEquals(expectedTopologyOrder.size(), validatedRows,
                    "Should validate one overview row per configured one-session test case");
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
