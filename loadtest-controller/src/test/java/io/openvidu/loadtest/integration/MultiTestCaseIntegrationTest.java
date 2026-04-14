package io.openvidu.loadtest.integration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verify;
import io.openvidu.loadtest.integration.mock.BrowserEmulatorMockServer;
import io.openvidu.loadtest.integration.mock.WebSocketMockServer;
import io.openvidu.loadtest.utils.ShutdownManager;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.select.Elements;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.core.type.TypeReference;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

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
        webSocketMock = new WebSocketMockServer(0);
        webSocketMock.start();

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
        Files.createDirectories(resultsDir);
        cleanupResultsDir();
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
        Path htmlReport = findLatestFile(resultsDir, "report-*.html");
        Path txtReport = findLatestFile(resultsDir, "results-*.txt");

        assertTrue(Files.exists(htmlReport), "HTML report should exist");
        assertTrue(Files.exists(txtReport), "TXT report should exist");

        validateMultiTestCaseHtmlReport(htmlReport);

        verify(shutdownManagerMock).shutdownWithCode(0);
    }

    private Path findLatestFile(Path directory, String pattern) throws IOException {
        Path latest = null;
        try (DirectoryStream<Path> files = Files.newDirectoryStream(directory, pattern)) {
            for (Path candidate : files) {
                if (latest == null
                        || Files.getLastModifiedTime(candidate).compareTo(Files.getLastModifiedTime(latest)) > 0) {
                    latest = candidate;
                }
            }
        }
        assertNotNull(latest, "No file matching pattern '" + pattern + "' in " + directory);
        return latest;
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

        // Parse the YAML test config to know expected participants for each test case
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
        try (InputStream is = getClass().getClassLoader()
                .getResourceAsStream("integration/config/multi-test-config.yaml")) {
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

            // For each overview row, assert the participants column matches the expected
            // total
            int idx = 0;
            // Explicit expected totals for the 3 test cases in this config
            int[] explicitExpected = new int[] { 25, 215, 303 };
            for (var row : comparisonRows) {
                Elements cells = row.select("td");
                if (cells.size() >= 7 && idx < testcases.size()) {
                    String label = cells.get(1).text();
                    String sessionsCell = cells.get(4).text();
                    String participantsCell = cells.get(5).text();
                    String workersCell = cells.get(6).text();
                    // Stop reason is the last column in the overview table
                    String stopReasonCell = cells.size() >= 9 ? cells.get(8).text() : "";
                    log.info("Test case '{}': sessions={}, participants={}, workers={}, stopReason={}", label,
                            sessionsCell, participantsCell, workersCell, stopReasonCell);

                    // Expected participants per session is declared in config under 'participants'
                    Map<String, Object> tc = testcases.get(idx);
                    List<String> participantsList = (List<String>) tc.get("participants");
                    // We only support single-entry participants in the test config for this
                    // assertion
                    String participantsSpec = participantsList.get(0);

                    // Compute expected per-session participants: sum parts if "a:b" or single
                    // integer
                    int expectedPerSession = 0;
                    if (participantsSpec.contains(":")) {
                        String[] parts = participantsSpec.split(":");
                        for (String p : parts) {
                            expectedPerSession += Integer.parseInt(p.trim());
                        }
                    } else {
                        expectedPerSession = Integer.parseInt(participantsSpec.trim());
                    }

                    String[] sessionsParts = sessionsCell.split("/");
                    int sessionsCreated = Integer.parseInt(sessionsParts[0].trim());
                    int expectedTotalParticipants = expectedPerSession * sessionsCreated;

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

                        // Additional explicit checks requested:
                        if (idx < explicitExpected.length) {
                            assertEquals(explicitExpected[idx], actualTotal,
                                    "Explicit total participants expected for test case does not match: " + label);
                        }

                        // Assert stop reason is exactly "Test finished"
                        assertEquals("Test finished", stopReasonCell,
                                "Stop reason should be 'Test finished' for test case: " + label);
                    } catch (NumberFormatException nfe) {
                        fail("Participants cell is not a number for test case: " + label + " value: "
                                + participantsCell);
                    }
                    idx++;
                }
            }

            // Additional validation: for N:M topology test cases, verify per-session
            // types: N publishers and M subscribers per session
            for (int tcIdx = 0; tcIdx < testcases.size(); tcIdx++) {
                Map<String, Object> tc = testcases.get(tcIdx);
                String topology = tc.get("topology") != null ? tc.get("topology").toString() : "";
                if ("N:M".equals(topology)) {
                    int tabIndex = tcIdx + 1; // template uses 1-based index for tabs
                    Elements nmUserTable = doc.select("#user-connections-table-" + tabIndex);
                    assertFalse(nmUserTable.isEmpty(),
                            "User Connections table should exist for N:M test (tab " + tabIndex + ")");
                    Elements nmUserRows = nmUserTable.select("tbody tr.user-row");

                    // Count publishers/subscribers per session
                    java.util.Map<String, Integer> publishersBySession = new java.util.HashMap<>();
                    java.util.Map<String, Integer> subscribersBySession = new java.util.HashMap<>();
                    for (var row : nmUserRows) {
                        Elements cells = row.select("td");
                        if (cells.size() >= 6) {
                            String sessionId = cells.get(1).text().trim();
                            String type = cells.get(2).text().trim();
                            if ("PUBLISHER".equals(type)) {
                                publishersBySession.merge(sessionId, 1, Integer::sum);
                            } else if ("SUBSCRIBER".equals(type)) {
                                subscribersBySession.merge(sessionId, 1, Integer::sum);
                            }
                        }
                    }

                    // Derive expected N and M from participants spec
                    List<String> participantsList = (List<String>) tc.get("participants");
                    String participantsSpec = participantsList.get(0);
                    int expectedN = 0;
                    int expectedM = 0;
                    if (participantsSpec.contains(":")) {
                        String[] parts = participantsSpec.split(":");
                        expectedN = Integer.parseInt(parts[0].trim());
                        expectedM = Integer.parseInt(parts[1].trim());
                    } else {
                        // Not an N:M spec; skip
                        continue;
                    }

                    java.util.Set<String> allSessions = new java.util.HashSet<>();
                    allSessions.addAll(publishersBySession.keySet());
                    allSessions.addAll(subscribersBySession.keySet());
                    assertFalse(allSessions.isEmpty(), "N:M user table should contain sessions");
                    for (String session : allSessions) {
                        int pubCount = publishersBySession.getOrDefault(session, 0);
                        int subCount = subscribersBySession.getOrDefault(session, 0);
                        assertEquals(expectedN, pubCount,
                                "Expected " + expectedN + " publishers in session " + session);
                        assertEquals(expectedM, subCount,
                                "Expected " + expectedM + " subscribers in session " + session);
                    }
                }
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
