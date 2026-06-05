package io.openvidu.loadtest.services.core;

import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.LoggerFactory;
import org.slf4j.Logger;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.WorkerUrlResolver;
import io.openvidu.loadtest.utils.DataIO;

class LoadTestTopologyOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(LoadTestTopologyOrchestrator.class);

    private static final String ERROR_WHILE_ESTIMATING = "Error while estimating number of users per browser. Test case skipped.";
    private static final String TEST_CASE_SKIPPED = "Test case skipped.";
    private static final String NO_MORE_WORKERS_AVAILABLE = "No more workers available";

    @FunctionalInterface
    private interface TestInvocation {
        CreateParticipantResponse run() throws NoWorkersAvailableException;
    }

    private final LoadTestService loadTestService;
    private final LoadTestConfig loadTestConfig;
    private final KibanaClient kibanaClient;
    private final BrowserEmulatorClient browserEmulatorClient;
    private final WorkerUrlResolver workerUrlResolver;
    private final DataIO dataIO;

    LoadTestTopologyOrchestrator(LoadTestService loadTestService, LoadTestConfig loadTestConfig,
            KibanaClient kibanaClient, BrowserEmulatorClient browserEmulatorClient,
            WorkerUrlResolver workerUrlResolver, DataIO dataIO) {
        this.loadTestService = loadTestService;
        this.loadTestConfig = loadTestConfig;
        this.kibanaClient = kibanaClient;
        this.browserEmulatorClient = browserEmulatorClient;
        this.workerUrlResolver = workerUrlResolver;
        this.dataIO = dataIO;
    }

    void startLoadTests(List<TestCase> testCasesList) {

        String timestamp = DataIO.generateTimestamp();

        kibanaClient.importDashboards();

        if (!loadTestService.hasInitialWorkersAvailable()) {
            log.error("No workers available. Exiting");
            return;
        }

        loadTestService.setTimestamp(timestamp);

        testCasesList.forEach(this::runTestCase);

        dataIO.exportAllResults(loadTestService.getAllReports(), timestamp);

        // Signal workers to cleanup and exit if configured
        if (loadTestConfig.isExitOnEnd()) {
            boolean isAwsMode = loadTestService.isProdMode();
            List<String> workerUrls = isAwsMode
                    ? loadTestService.getAwsWorkersList().stream()
                            .map(workerUrlResolver::resolveUrl)
                            .toList()
                    : loadTestService.getDevWorkersList();

            if (!workerUrls.isEmpty()) {
                log.info("Sending exit signal to {} workers ({} mode)",
                        workerUrls.size(), isAwsMode ? "AWS" : "local");

                // Wait for response with timeout to ensure shutdown request is delivered
                browserEmulatorClient.shutdownWorkers(workerUrls, true);
            }
        }

        // Terminate workers after all test cases are completed if configured
        if (loadTestConfig.isTerminateWorkers()) {
            log.info("Terminate all EC2 instances");
            loadTestService.terminateAllInstances();
        }
    }

    private boolean firstTestCase = true;

    private void runTestCase(TestCase testCase) {
        if (!firstTestCase) {
            loadTestService.resetForNewTestCase();
        }
        firstTestCase = false;
        if (testCase.isNxN()) {
            runNxNCase(testCase);
        } else if (testCase.isNxM() || testCase.isTeaching()) {
            runNxMCase(testCase);
        } else if (testCase.isOneSessionNxn()) {
            runOneSessionNxNCase(testCase);
        } else if (testCase.isOneSessionNxm()) {
            runOneSessionNxMCase(testCase);
        } else {
            log.error("Test case has wrong topology, SKIPPED.");
        }
    }

    private void runNxNCase(TestCase testCase) {
        for (String participants : testCase.getParticipants()) {
            try {
                int participantsBySession = testCase.getParticipantCount(0); // Always use first (and only) participant spec for N:N
                boolean instancesInitialized = loadTestService.launchInitialInstances();
                boolean noEstimateError = prepareEstimation(instancesInitialized, testCase, participantsBySession, 0,
                        false);
                if (noEstimateError) {
                    boolean continueTest = loadTestService.checkEnoughWorkers(testCase.getSessions(),
                            participantsBySession);
                    if (!continueTest) {
                        log.warn(TEST_CASE_SKIPPED);
                        continue;
                    }
                    logNxNStart(testCase, participantsBySession);
                    executeAndSave(testCase, String.valueOf(participantsBySession),
                            () -> loadTestService.startNxNTest(participantsBySession, testCase));
                } else {
                    log.error(ERROR_WHILE_ESTIMATING);
                }
            } catch (Exception e) {
                log.error("Error occurred while running test case", e);
            } finally {
                loadTestService.cleanupAfterParticipantConfiguration();
            }
        }
    }

    private void runNxMCase(TestCase testCase) {
        for (String participants : testCase.getParticipants()) {
            try {
                int publishers = testCase.getPublisherCount(0); // Always use first (and only) participant spec for N:M
                int subscribers = testCase.getSubscriberCount(0); // Always use first (and only) participant spec for N:M
                boolean instancesInitialized = loadTestService.launchInitialInstances();
                boolean noEstimateError = prepareEstimation(instancesInitialized, testCase, publishers, subscribers,
                        false);
                if (noEstimateError) {
                    boolean continueTest = loadTestService.checkEnoughWorkers(testCase.getSessions(),
                            publishers + subscribers);
                    if (!continueTest) {
                        log.warn(TEST_CASE_SKIPPED);
                        continue;
                    }
                    logNxMStart(testCase, publishers, subscribers);
                    executeAndSave(testCase, participants,
                            () -> loadTestService.startNxMTest(publishers, subscribers, testCase));
                } else {
                    log.error(ERROR_WHILE_ESTIMATING);
                }
            } catch (Exception e) {
                log.error("Error occurred while running test case", e);
            } finally {
                loadTestService.cleanupAfterParticipantConfiguration();
            }
        }
    }

    private void runOneSessionNxNCase(TestCase testCase) {
        for (String participants : testCase.getParticipants()) {
            try {
                boolean instancesInitialized = loadTestService.launchInitialInstances();
                int participantCount = "infinite".equalsIgnoreCase(participants) ? Integer.MAX_VALUE : Integer.parseInt(participants);
                runOneSessionNxN(testCase, participants, instancesInitialized, participantCount);
            } catch (Exception e) {
                log.error("Error occurred while running test case", e);
            } finally {
                loadTestService.cleanupAfterParticipantConfiguration();
            }
        }
    }

    private void runOneSessionNxMCase(TestCase testCase) {
        for (String participants : testCase.getParticipants()) {
            try {
                boolean instancesInitialized = loadTestService.launchInitialInstances();
                int publishers = testCase.getPublisherCount(0); // Always use first (and only) participant spec for ONE_SESSION_NXM
                int subscriberCount = testCase.getSubscriberCount(0); // Always use first (and only) participant spec for ONE_SESSION_NXM
                runOneSessionNxM(testCase, participants, instancesInitialized, publishers, subscriberCount);
            } catch (Exception e) {
                log.error("Error occurred while running test case", e);
            } finally {
                loadTestService.cleanupAfterParticipantConfiguration();
            }
        }
    }

    private void runOneSessionNxM(TestCase testCase, String participants, boolean instancesInitialized, int publishers, int subscriberCount) {
        String[] parts = participants.split(":");
        boolean noEstimateError = prepareEstimation(instancesInitialized, testCase, publishers, subscriberCount, false);
        if (noEstimateError) {
            boolean continueTest = loadTestService.checkEnoughWorkers(-1, -1);
            if (!continueTest) {
                log.warn(TEST_CASE_SKIPPED);
                return;
            }
            log.info("Starting test with one session {}:{} topology", publishers, subscriberCount);
            log.info(
                    "{} Publishers will be added to one session, and then it will be filled with {} Subscribers",
                    publishers, subscriberCount);
            executeAndSave(testCase, participants, () -> loadTestService.startOneSessionNxmTest(publishers, testCase));
        } else {
            log.error(ERROR_WHILE_ESTIMATING);
        }
    }

    private void runOneSessionNxN(TestCase testCase, String participants, boolean instancesInitialized, int participantCount) {
        boolean forceOneBrowserPerWorkerInDevOneSession = participantCount == Integer.MAX_VALUE;
        boolean noEstimateError = prepareEstimation(instancesInitialized, testCase, participantCount, 0,
                forceOneBrowserPerWorkerInDevOneSession);
        if (noEstimateError) {
            log.info("Starting test with one session N:N topology");
            log.info("One session will be filled with Pubscribers");
            executeAndSave(testCase, participants, () -> loadTestService.startOneSessionNxNTest(testCase));
        } else {
            log.error(ERROR_WHILE_ESTIMATING);
        }
    }

    private boolean prepareEstimation(boolean instancesInitialized, TestCase testCase, int publishers, int subscribers,
            boolean forceOneBrowserPerWorkerInDevOneSession) {
        if (forceOneBrowserPerWorkerInDevOneSession && !loadTestService.isProdMode()) {
            loadTestService.setEstimationBrowserEstimation(1);
            return true;
        }
        if (loadTestConfig.isManualParticipantsAllocation()) {
            loadTestService.setEstimationBrowserEstimation(loadTestConfig.getUsersPerWorker());
            return true;
        }
        return loadTestService.estimate(instancesInitialized, testCase,
                publishers, subscribers);
    }

    private void executeAndSave(TestCase testCase, String participantsBySession, TestInvocation invocation) {
        loadTestService.setStartTimeNow();
        CreateParticipantResponse lastCPR;
        try {
            lastCPR = invocation.run();
        } catch (NoWorkersAvailableException e) {
            lastCPR = new CreateParticipantResponse().setStopReason(NO_MORE_WORKERS_AVAILABLE);
        } catch (RuntimeException e) {
            lastCPR = this.unexpectedErrorResponse(e);
        }
        loadTestService.completeTestAndSave(testCase, participantsBySession, lastCPR);
    }

    private void logNxNStart(TestCase testCase, int participantsBySession) {
        log.info("Starting test with N:N session topology");
        log.info("The number of session that will be created are {}",
                testCase.getSessions() < 0 ? "infinite" : testCase.getSessions());
        log.info("Each session will be composed by {} USERS. All of them will be PUBLISHERS",
                participantsBySession);
    }

    private void logNxMStart(TestCase testCase, int publishers, int subscribers) {
        log.info("Starting test with N:M session topology");
        log.info("The number of session that will be created are {}", testCase.getSessions());
        log.info("Each session will be composed by {} users. {} Publisher and {} Subscribers",
                publishers + subscribers, publishers, subscribers);
    }

    private CreateParticipantResponse unexpectedErrorResponse(Exception e) {
        log.error("An unexpected error occurred", e);
        return new CreateParticipantResponse().setStopReason("An unexpected error occurred: " + e.getMessage());
    }
}
