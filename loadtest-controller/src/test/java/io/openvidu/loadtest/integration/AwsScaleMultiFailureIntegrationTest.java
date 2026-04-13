package io.openvidu.loadtest.integration;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import io.floci.testcontainers.FlociContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.openvidu.loadtest.integration.mock.BrowserEmulatorMockServer;
import io.openvidu.loadtest.integration.mock.ReconnectionFailureSimulator;
import io.openvidu.loadtest.integration.mock.WebSocketMockServer;
import io.openvidu.loadtest.utils.ShutdownManager;
import software.amazon.awssdk.services.ec2.model.*;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;

/**
 * Integration test for multi-scenario reconnection failure simulation.
 *
 * Test flow:
 * 1. Start mock servers with reconnection failure simulator (no pre-registered
 * failures)
 * 2. Controller initializes workers and starts creating participants (5 per
 * session)
 * 3. Participants 1+ succeed normally until the trigger participant is reached
 * 4. When the trigger participant is created:
 * a. Dynamically register participants 50-75 to fail once on creation
 * b. Dynamically register User5-LoadTestSession16 to fail when participant 150
 * up to max
 * retries
 * c. Test terminates with the expected stop reason
 * 5. Validate reports:
 * a. Stop reason indicates User5-LoadTestSession16 failure
 * b. User connections table shows retry counts
 *
 * This test demonstrates dynamic failure injection mid-test, simulating
 * scenarios where participants fail after the test has been running for a
 * while.
 */
@SpringBootTest(classes = { io.openvidu.loadtest.LoadTestApplication.class,
        io.openvidu.loadtest.integration.config.IntegrationTestConfig.class }, webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "LOADTEST_CONFIG=integration/config/ec2-scale-test-config.yaml"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class AwsScaleMultiFailureIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(AwsScaleMultiFailureIntegrationTest.class);

    /**
     * Trigger failure registration early enough to guarantee participants 50-75
     * have not started creation yet, even with parallel in-flight requests.
     */
    private static final int FAILURE_REGISTRATION_TRIGGER_PARTICIPANT = 20;
    /**
     * Phase-2 trigger: register participant 80 to start failing only when
     * participant 150 has connected.
     */
    private static final int FAILURE_REGISTRATION_TRIGGER_PARTICIPANT_PHASE2 = 150;
    private static final int MAX_ALIVE_CHECK_RETRIES = 10;

    private static String createdSecurityGroupId;
    private static String createdAmiId;

    @SuppressWarnings("resource")
    @Container
    private static final FlociContainer floci = new FlociContainer();

    @DynamicPropertySource
    static void configureEc2Properties(DynamicPropertyRegistry registry) {
        IntegrationTestEnvironment.configureFlociAndStartMocks(registry, floci, "test-security-group-multi",
                "test-ami-multi", null, null);
    }

    private static BrowserEmulatorMockServer browserEmulatorMock;
    private static WebSocketMockServer webSocketMockServer;
    private static ReconnectionFailureSimulator failureSimulator;
    private static Path resultsDir;
    private static software.amazon.awssdk.services.ec2.Ec2Client flociEc2Client;
    private static volatile boolean failureTriggered = false;
    private static volatile boolean failureTriggeredPhase2 = false;

    @MockitoBean
    private ShutdownManager shutdownManagerMock;

    @BeforeAll
    static void setup() throws Exception {
        log.info("=== AwsScaleMultiFailureIntegrationTest Setup ===");
        cleanupResultsDir();
        String ec2Endpoint = floci.getEndpoint() + "/";
        log.info("Floci EC2 endpoint: {}", ec2Endpoint);

        flociEc2Client = software.amazon.awssdk.services.ec2.Ec2Client.builder()
                .region(Region.US_EAST_1)
                .endpointOverride(java.net.URI.create(ec2Endpoint))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("test", "test")))
                .build();

        resultsDir = Path.of("target/test-results/aws-scale-multi");
        System.setProperty("RESULTS_DIR", resultsDir.toAbsolutePath().toString());
        Files.createDirectories(resultsDir);

        configureTrustingSslContext();
        // Ensure mock servers are running and available; copy shared refs to locals
        IntegrationTestEnvironment.startMocksIfNeeded(floci, "test-security-group-multi", "test-ami-multi",
                null, null);

        // Assign local references from shared environment
        browserEmulatorMock = IntegrationTestEnvironment.browserEmulatorMock;
        webSocketMockServer = IntegrationTestEnvironment.webSocketMockServer;
        failureSimulator = IntegrationTestEnvironment.failureSimulator;
        createdSecurityGroupId = IntegrationTestEnvironment.createdSecurityGroupId;
        createdAmiId = IntegrationTestEnvironment.createdAmiId;
        log.info("Mock servers ports: http={}, websocket={}",
                browserEmulatorMock != null ? browserEmulatorMock.getPort() : -1,
                webSocketMockServer != null ? webSocketMockServer.getPort() : -1);

        // Register participant creation listener to trigger failure registration
        browserEmulatorMock.addParticipantCreationListener((userId, sessionName, participantNum) -> {
            int sessionNum = 0;
            String sessionPrefix = "LoadTestSession";
            if (sessionName.startsWith(sessionPrefix)) {
                try {
                    sessionNum = Integer.parseInt(sessionName.substring(sessionPrefix.length()));
                } catch (NumberFormatException e) {
                    return;
                }
            }
            int globalParticipantNum = (sessionNum - 1) * 5 + participantNum;

            // Phase 1: when trigger participant is reached, register participants 50-75 to
            // fail once
            if (globalParticipantNum == FAILURE_REGISTRATION_TRIGGER_PARTICIPANT && !failureTriggered) {
                synchronized (AwsScaleMultiFailureIntegrationTest.class) {
                    if (failureTriggered)
                        return;
                    // Log the trigger occurrence with mapping details to aid debugging in CI logs
                    log.info(
                            "Phase 1 trigger hit by globalParticipantNum={} (session={}, participant={}) - registering participants 50-75 to fail once",
                            globalParticipantNum, sessionNum, participantNum);
                    failureTriggered = true;
                    triggerPhase1Failures();
                }
            }

            // Phase 2: register participant 80 to fail only when participant 150 has
            // connected
            if (globalParticipantNum == FAILURE_REGISTRATION_TRIGGER_PARTICIPANT_PHASE2 && !failureTriggeredPhase2) {
                synchronized (AwsScaleMultiFailureIntegrationTest.class) {
                    if (failureTriggeredPhase2)
                        return;
                    // Log the trigger with mapping info for traceability
                    log.info(
                            "Phase 2 trigger hit by globalParticipantNum={} (session={}, participant={}) - registering participant 80 to fail on creation",
                            globalParticipantNum, sessionNum, participantNum);
                    failureTriggeredPhase2 = true;
                    triggerPhase2Failure80();
                }
            }
        });

        // Set max participants threshold to stop test after Phase 2 failure triggers
        // reconnection
        // Use 220 participants: enough to reach global 150 (Phase 2 trigger) + allow
        // full 5 reconnection attempts for participant 80 to complete + buffer
        browserEmulatorMock.setMaxParticipantsThreshold(170, () -> {
            log.info("Max participants threshold reached - triggering test termination");
            browserEmulatorMock.triggerTestTermination();
        });

        log.info("Setup complete");
        log.info(
                "Test will register participants 50-75 to fail once when participant {} is reached, and register participant 80 to fail on creation when participant {} is reached",
                FAILURE_REGISTRATION_TRIGGER_PARTICIPANT, FAILURE_REGISTRATION_TRIGGER_PARTICIPANT_PHASE2);
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

    /**
     * Phase 1: Register participants 50-75 to fail once on creation (simulating
     * temporary network issue).
     * With 5 participants per session:
     * - Participant 50 = User5 in session 10
     * - Participant 75 = User5 in session 15
     */
    private static void triggerPhase1Failures() {
        log.info("=== Triggering Phase 1 failures for participants 50-75 (1 retry each) ===");

        for (int participantNum = 50; participantNum <= 75; participantNum++) {
            int sessionNum = (int) Math.ceil((double) participantNum / 5.0);
            int userInSession = ((participantNum - 1) % 5) + 1;
            String userId = "User" + userInSession;
            String sessionName = "LoadTestSession" + sessionNum;
            failureSimulator.addFailOnCreateNTimes(userId, sessionName, 1);
        }
        log.info("Registered participants 50-75 to fail once on creation");
    }

    /**
     * Phase 2: Register participant 80 to fail on reconnection (after disconnect).
     * This is deferred until a later global participant (e.g. 150) has connected
     * to ensure ordering in the test.
     * Participant 80 = User5 in session 16
     * 
     * Using addFailOnReconnect: when Phase 2 triggers, we send a disconnect event
     * via WebSocket, the controller tries to reconnect, and the reconnection fails
     * MAX_RETRIES times (5) before test termination.
     */
    private static void triggerPhase2Failure80() {
        log.info(
                "=== Triggering Phase 2 failure: participant 80 will fail on reconnection (will trigger test termination) ===");
        failureSimulator.addFailOnReconnect("User5", "LoadTestSession16");
        log.info(
                "Registered User5-LoadTestSession16 to fail on reconnection (will trigger test termination after 5 retries)");

        if (webSocketMockServer != null && webSocketMockServer.isRunning()) {
            webSocketMockServer.sendDisconnected("User5", "LoadTestSession16");
            log.info("Sent sessionDisconnected event for User5-LoadTestSession16 to trigger reconnect attempts");
        } else {
            log.warn("WebSocketMockServer not available to send disconnect event for User5-LoadTestSession16");
        }
    }

    @AfterAll
    static void cleanup() {
        log.info("=== AwsScaleMultiFailureIntegrationTest Cleanup ===");

        if (browserEmulatorMock != null) {
            browserEmulatorMock.stop();
        }
        if (webSocketMockServer != null) {
            webSocketMockServer.stop();
        }

        if (flociEc2Client != null) {
            try {
                DescribeInstancesResponse response = flociEc2Client.describeInstances(
                        DescribeInstancesRequest.builder()
                                .filters(Filter.builder()
                                        .name("tag:Type")
                                        .values("OpenViduLoadTest")
                                        .build())
                                .build());

                List<String> instanceIds = new ArrayList<>();
                for (Reservation reservation : response.reservations()) {
                    for (Instance instance : reservation.instances()) {
                        instanceIds.add(instance.instanceId());
                    }
                }

                if (!instanceIds.isEmpty()) {
                    flociEc2Client.terminateInstances(
                            TerminateInstancesRequest.builder()
                                    .instanceIds(instanceIds)
                                    .build());
                    log.info("Terminated {} EC2 instances", instanceIds.size());
                }
            } catch (Exception e) {
                log.warn("Error cleaning up EC2 instances: {}", e.getMessage());
            }
            flociEc2Client.close();
        }

        if (floci != null) {
            floci.stop();
        }

        System.clearProperty("RESULTS_DIR");
        log.info("Cleanup complete");
    }

    @Test
    @Timeout(value = 10, unit = TimeUnit.MINUTES)
    void testScaleWithDynamicFailureInjection() throws Exception {
        log.info("=== Starting Scale Test with Dynamic Failure Injection ===");

        Path htmlReport = resultsDir.resolve("report.html");
        Path txtReport = resultsDir.resolve("results.txt");

        log.info("=== Validating Results ===");

        validateHtmlReport(htmlReport);
        validateTxtReport(txtReport);

        int requestCount = browserEmulatorMock.getRequestCount();
        log.info("Total requests received by mock server: {}", requestCount);

        verifyNoInstancesAlive();

        log.info("=== Scale Test with Dynamic Failure Injection Completed Successfully ===");
    }

    private void verifyNoInstancesAlive() {
        log.info("Verifying no instances are alive (max {} retries)...", MAX_ALIVE_CHECK_RETRIES);

        for (int retry = 0; retry <= MAX_ALIVE_CHECK_RETRIES; retry++) {
            try {
                DescribeInstancesResponse response = flociEc2Client.describeInstances(
                        DescribeInstancesRequest.builder()
                                .filters(Filter.builder()
                                        .name("tag:Type")
                                        .values("OpenViduLoadTest")
                                        .build())
                                .build());

                int aliveCount = 0;
                for (Reservation reservation : response.reservations()) {
                    for (Instance instance : reservation.instances()) {
                        InstanceStateName state = instance.state().name();
                        if (state == InstanceStateName.RUNNING || state == InstanceStateName.PENDING) {
                            aliveCount++;
                        }
                    }
                }

                if (aliveCount == 0) {
                    log.info("No instances alive after {} retries", retry);
                    return;
                }

                log.info("Retry {}/{}: Found {} alive instances", retry + 1, MAX_ALIVE_CHECK_RETRIES, aliveCount);

                if (retry < MAX_ALIVE_CHECK_RETRIES) {
                    Thread.sleep(1000);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                fail("Interrupted while checking for alive instances");
            } catch (Exception e) {
                log.warn("Error checking instances: {}", e.getMessage());
            }
        }

        fail("Found alive instances after " + MAX_ALIVE_CHECK_RETRIES + " retries");
    }

    private void validateHtmlReport(Path htmlReport) throws IOException {
        String content = Files.readString(htmlReport);
        Document doc = Jsoup.parse(content);

        Elements summaryTable = doc.select("#summary-table, #summary-table-1");
        assertFalse(summaryTable.isEmpty(), "Summary table should exist");

        Elements rows = summaryTable.select("tr");
        boolean foundStopReason = false;
        for (var row : rows) {
            String metric = row.select("td.metric").text();
            String value = row.select("td.value").text();

            if (metric.equals("Stop Reason")) {
                foundStopReason = true;
                log.info("Stop Reason: {}", value);
                assertEquals("Participant User5-LoadTestSession16 failed to reconnect after 5 attempts", value,
                        "Stop reason should indicate User5-LoadTestSession16 reconnection failure");
            }
        }
        assertTrue(foundStopReason, "HTML report should contain Stop Reason");

        Elements userTable = doc.select("#user-connections-table, #user-connections-table-1");
        assertFalse(userTable.isEmpty(), "User Connections table should exist");

        // Validate that participants 50-75 have retry counts recorded in the user
        // connections table
        validateUserRetryCounts(doc);

        log.info("HTML report validation passed");
    }

    /**
     * Validate that participants 50-75 have retry counts recorded in the user
     * connections table.
     * Each of these participants was registered to fail once on creation,
     * so they should have retry count exactly 1.
     */
    private void validateUserRetryCounts(Document doc) {
        final int firstParticipantWithSingleFailure = 50;
        final int lastParticipantWithSingleFailure = 75;
        final int expectedParticipantsWithSingleFailure = lastParticipantWithSingleFailure
                - firstParticipantWithSingleFailure + 1;

        Elements userTable = doc.select("#user-connections-table, #user-connections-table-1");
        assertFalse(userTable.isEmpty(), "User Connections table should exist");

        Elements userRows = userTable.select("tbody tr.user-row");
        assertFalse(userRows.isEmpty(), "User Connections table should have rows");

        log.info("Validating retry counts for participants {}-{} in user connections table",
                firstParticipantWithSingleFailure, lastParticipantWithSingleFailure);

        // Build maps of userKey -> retries and userKey -> userRow from the table
        Map<String, Integer> userRetries = new HashMap<>();
        Map<String, Element> userRowsByKey = new HashMap<>();
        for (Element row : userRows) {
            Elements cells = row.select("td");
            // After adding the 'Type' column the table now has at least 6 columns
            if (cells.size() >= 6) {
                String userId = cells.get(0).text().trim();
                String sessionId = cells.get(1).text().trim();
                String userKey = userId + "-" + sessionId;
                // Retries column shifted from index 3 -> 4 due to inserted 'Type' column
                userRetries.put(userKey, parseRetriesFromCell(cells.get(4), userKey));
                userRowsByKey.put(userKey, row);
            }
        }

        int validatedParticipants = 0;
        for (int participantNum = firstParticipantWithSingleFailure; participantNum <= lastParticipantWithSingleFailure; participantNum++) {
            int sessionNum = (int) Math.ceil((double) participantNum / 5.0);
            int userInSession = ((participantNum - 1) % 5) + 1;
            String userId = "User" + userInSession;
            String sessionName = "LoadTestSession" + sessionNum;
            String userKey = userId + "-" + sessionName;

            Element userRow = userRowsByKey.get(userKey);
            assertNotNull(userRow,
                    "Participant " + participantNum + " (" + userKey
                            + ") should be present in the user connections table");

            Integer retries = userRetries.get(userKey);
            assertNotNull(retries,
                    "Retry count should be present for participant " + participantNum + " (" + userKey + ")");
            assertEquals(1, retries.intValue(),
                    "Participant " + participantNum + " (" + userKey + ") should have exactly 1 retry");

            Element retryDetailsButton = userRow.selectFirst(".retry-details-btn[data-detail-id]");
            assertNotNull(retryDetailsButton,
                    "Retry details button should be present for participant " + participantNum + " (" + userKey + ")");

            String detailId = retryDetailsButton.attr("data-detail-id");
            assertFalse(detailId.isBlank(), "Retry details button should contain data-detail-id for " + userKey);

            Element detailRow = doc.getElementById(detailId);
            assertNotNull(detailRow, "Retry detail row should be present for " + userKey + " (id=" + detailId + ")");

            Elements attemptRows = detailRow.select(".retry-attempts-table tbody tr");
            assertEquals(1, attemptRows.size(),
                    "Participant " + participantNum + " (" + userKey + ") should have exactly 1 retry attempt row");

            validatedParticipants++;
            log.info("Participant {} ({}) has expected retry count and retry details", participantNum, userKey);
        }

        assertEquals(expectedParticipantsWithSingleFailure, validatedParticipants,
                "All participants 50-75 should be validated with retry count 1");

        log.info("User retry count validation passed: {} participants validated", validatedParticipants);
    }

    private int parseRetriesFromCell(Element retriesCell, String userKey) {
        String retriesText = retriesCell.text().trim();
        try {
            return Integer.parseInt(retriesText);
        } catch (NumberFormatException e) {
            Element retrySpan = retriesCell.selectFirst("span.error-count");
            if (retrySpan != null) {
                try {
                    return Integer.parseInt(retrySpan.text().trim());
                } catch (NumberFormatException ex) {
                    log.warn("Could not parse retries from span for {}: {}", userKey, retriesText);
                }
            }
            fail("Could not parse retries for " + userKey + " from value: '" + retriesText + "'");
            return -1;
        }
    }

    private void validateTxtReport(Path txtReport) throws IOException {
        String content = Files.readString(txtReport);

        assertTrue(content.contains("Test Case Report"), "TXT should contain Test Case Report header");
        assertTrue(content.contains("Stop reason:"), "TXT should contain stop reason");

        Pattern pattern = Pattern.compile("Stop reason: (.+)");
        Matcher matcher = pattern.matcher(content);
        if (matcher.find()) {
            String stopReason = matcher.group(1);
            log.info("TXT Stop Reason: {}", stopReason);
            assertTrue(
                    stopReason.contains("failed") || stopReason.contains("retry") || stopReason.contains("reconnect")
                            || stopReason.contains("Test finished"),
                    "Stop reason should mention retry failure or test completion: " + stopReason);
        }

        log.info("TXT report validation passed");
    }

    private static void configureTrustingSslContext() throws Exception {
        TrustManager[] trustAllCerts = new TrustManager[] {
                new X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                        return null;
                    }

                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }

                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) {
                    }
                }
        };

        SSLContext sc = SSLContext.getInstance("TLS");
        sc.init(null, trustAllCerts, new SecureRandom());
        SSLContext.setDefault(sc);
    }

}
