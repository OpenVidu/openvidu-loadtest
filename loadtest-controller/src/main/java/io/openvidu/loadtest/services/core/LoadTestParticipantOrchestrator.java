package io.openvidu.loadtest.services.core;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.UserInfo;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Sleeper;

class LoadTestParticipantOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(LoadTestParticipantOrchestrator.class);

    private static final class ParticipantPhase {
        private final Role role;
        private final int participantCount;
        private final boolean flushWithoutWaitAtPhaseEnd;
        private final String recordingMetadata;
        private final boolean useRecordingWorkerForRecordingParticipant;

        private ParticipantPhase(Role role, int participantCount, boolean flushWithoutWaitAtPhaseEnd,
                String recordingMetadata, boolean useRecordingWorkerForRecordingParticipant) {
            this.role = role;
            this.participantCount = participantCount;
            this.flushWithoutWaitAtPhaseEnd = flushWithoutWaitAtPhaseEnd;
            this.recordingMetadata = recordingMetadata;
            this.useRecordingWorkerForRecordingParticipant = useRecordingWorkerForRecordingParticipant;
        }
    }

    private final LoadTestService loadTestService;
    private final BrowserEmulatorClient browserEmulatorClient;
    private final ElasticSearchClient esClient;
    private final LoadTestConfig loadTestConfig;
    private final Sleeper sleeper;

    private Map<Calendar, List<String>> userStartTimes = new ConcurrentHashMap<>();
    private AtomicInteger sessionNumber = new AtomicInteger(0);
    private AtomicInteger sessionsCompleted = new AtomicInteger(0);
    private AtomicInteger totalParticipants = new AtomicInteger(0);
    private AtomicInteger userNumber = new AtomicInteger(1);
    private List<CreateParticipantResponse> allResponses = new ArrayList<>();

    LoadTestParticipantOrchestrator(LoadTestService loadTestService, BrowserEmulatorClient browserEmulatorClient,
            ElasticSearchClient esClient, LoadTestConfig loadTestConfig, Sleeper sleeper) {
        this.loadTestService = loadTestService;
        this.browserEmulatorClient = browserEmulatorClient;
        this.esClient = esClient;
        this.loadTestConfig = loadTestConfig;
        this.sleeper = sleeper;
    }

    CreateParticipantResponse startOneSessionNxNTest(TestCase testCase) throws NoWorkersAvailableException {
        LoadTestParticipantRunState state = createParticipantRunState(testCase);
        sessionNumber.set(1);
        log.info("Starting session '1'");
        try (ExecutorService executorService = Executors.newFixedThreadPool(state.getMaxRequestsInFlight())) {
            return runUnboundedPhase(testCase, executorService, state, Role.PUBLISHER, "N-N_ONE", false);
        }
    }

    CreateParticipantResponse startOneSessionXxNTest(int publishers, TestCase testCase)
            throws NoWorkersAvailableException {
        LoadTestParticipantRunState state = createParticipantRunState(testCase);
        sessionNumber.set(1);
        log.info("Starting session '1'");
        String recordingMetadata = "X-M_" + publishers + "_ONE";

        try (ExecutorService executorService = Executors.newFixedThreadPool(state.getMaxRequestsInFlight())) {
            CreateParticipantResponse publishersResponse = runBoundedPhase(testCase, executorService, state,
                    new ParticipantPhase(Role.PUBLISHER, publishers, false, recordingMetadata, true));
            if (publishersResponse != null) {
                return publishersResponse;
            }
            return runUnboundedPhase(testCase, executorService, state, Role.SUBSCRIBER, recordingMetadata, true);
        }
    }

    private boolean needCreateNewSession(int sessionsLimit) {
        return sessionsLimit == -1 || (sessionsLimit > 0 && sessionsCompleted.get() < sessionsLimit);
    }

    CreateParticipantResponse startNxNTest(int participantsBySession, TestCase testCase)
            throws NoWorkersAvailableException {
        int testCaseSessionsLimit = testCase.getSessions();
        LoadTestParticipantRunState state = createParticipantRunState(testCase);

        while (this.needCreateNewSession(testCaseSessionsLimit)) {

            if (sessionNumber.get() > 0) {
                sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
            }

            int sessNum = sessionNumber.incrementAndGet();
            log.info("Starting session '{}{}'", loadTestConfig.getSessionNamePrefix(), sessNum);
            boolean isLastSession = sessNum == testCaseSessionsLimit;
            try (ExecutorService executorService = Executors.newFixedThreadPool(state.getMaxRequestsInFlight())) {

                String recordingMetadata = "N-N_" + participantsBySession + "_" + participantsBySession + "PSes";
                CreateParticipantResponse phaseResponse = runBoundedPhase(testCase, executorService, state,
                        new ParticipantPhase(Role.PUBLISHER, participantsBySession, isLastSession,
                                recordingMetadata, true));
                if (phaseResponse != null) {
                    return phaseResponse;
                }

                log.info("Session number {} has been succesfully created ", sessNum);
                sessionsCompleted.incrementAndGet();
                userNumber.set(1);
            }
        }
        return state.getLastResponse();
    }

    CreateParticipantResponse startNxMTest(int publishers, int subscribers, TestCase testCase)
            throws NoWorkersAvailableException {
        int testCaseSessionsLimit = testCase.getSessions();
        LoadTestParticipantRunState state = createParticipantRunState(testCase);
        String recordingMetadata = "N-M_" + publishers + "_" + subscribers + "PSes";

        try (ExecutorService executorService = Executors.newFixedThreadPool(state.getMaxRequestsInFlight())) {
            while (this.needCreateNewSession(testCaseSessionsLimit)) {

                if (sessionNumber.get() > 0) {
                    sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
                }

                int sessNum = sessionNumber.incrementAndGet();
                log.info("Starting session '{}{}'", loadTestConfig.getSessionNamePrefix(), sessNum);
                boolean isLastSession = sessNum == testCaseSessionsLimit;

                CreateParticipantResponse publishersResponse = runBoundedPhase(testCase, executorService, state,
                        new ParticipantPhase(Role.PUBLISHER, publishers, false, recordingMetadata, true));
                if (publishersResponse != null) {
                    return publishersResponse;
                }

                CreateParticipantResponse subscribersResponse = runBoundedPhase(testCase, executorService, state,
                        new ParticipantPhase(Role.SUBSCRIBER, subscribers, isLastSession, recordingMetadata, true));
                if (subscribersResponse != null) {
                    return subscribersResponse;
                }
                log.info("Session number {} has been succesfully created ", sessNum);
                sessionsCompleted.incrementAndGet();
                userNumber.set(1);
            }
        }
        return state.getLastResponse();
    }

    private CreateParticipantResponse runBoundedPhase(TestCase testCase, ExecutorService executorService,
            LoadTestParticipantRunState state, ParticipantPhase phase)
            throws NoWorkersAvailableException {
        for (int i = 0; i < phase.participantCount; i++) {
            CompletableFuture<CreateParticipantResponse> future = submitParticipant(testCase, executorService,
                    state, phase.role, phase.recordingMetadata, phase.useRecordingWorkerForRecordingParticipant);
            trackParticipantFuture(state, future);

            boolean isLastParticipant = i == phase.participantCount - 1;
            CreateParticipantResponse response;
            if (isLastParticipant && phase.flushWithoutWaitAtPhaseEnd) {
                response = flushParticipantResponses(state, false);
            } else {
                response = evaluateAfterParticipant(state);
            }
            if (response != null) {
                return response;
            }
        }
        return null;
    }

    private CreateParticipantResponse runUnboundedPhase(TestCase testCase, ExecutorService executorService,
            LoadTestParticipantRunState state, Role role, String recordingMetadata,
            boolean useRecordingWorkerForRecordingParticipant)
            throws NoWorkersAvailableException {
        while (true) {
            CompletableFuture<CreateParticipantResponse> future = submitParticipant(testCase, executorService,
                    state, role, recordingMetadata, useRecordingWorkerForRecordingParticipant);
            trackParticipantFuture(state, future);
            CreateParticipantResponse response = evaluateAfterParticipant(state);
            if (response != null) {
                return response;
            }
        }
    }

    private LoadTestParticipantRunState createParticipantRunState(TestCase testCase)
            throws NoWorkersAvailableException {
        String worker = loadTestService.setAndInitializeNextWorker("", WorkerType.WORKER);
        boolean batches = loadTestConfig.isBatches();
        int startingParticipants = testCase.getStartingParticipants();
        int batchMax = loadTestConfig.getBatchMaxRequests();
        int maxRequestsInFlight = batches ? Math.max(startingParticipants, batchMax)
                : Math.max(startingParticipants, 1);
        boolean waitCompletion = loadTestConfig.isWaitCompletion();
        return new LoadTestParticipantRunState(worker, startingParticipants, batchMax, batches, waitCompletion,
                maxRequestsInFlight);
    }

    private void ensureWorkerCapacity(LoadTestParticipantRunState state) throws NoWorkersAvailableException {
        if (state.getBrowsersInWorker() >= loadTestService.getBrowserEstimation()) {
            log.info("Browsers in worker: {} is equal than limit: {}", state.getBrowsersInWorker(),
                    loadTestService.getBrowserEstimation());
            state.setWorker(loadTestService.setAndInitializeNextWorker(state.getWorker(), WorkerType.WORKER));
            state.setBrowsersInWorker(0);
        }
    }

    private CompletableFuture<CreateParticipantResponse> submitParticipant(TestCase testCase,
            ExecutorService executorService, LoadTestParticipantRunState state, Role role, String recordingMetadata,
            boolean useRecordingWorkerForRecordingParticipant) throws NoWorkersAvailableException {
        ensureWorkerCapacity(state);
        log.info("Creating {} '{}{}' in session {}{}", role,
                loadTestConfig.getUserNamePrefix(), userNumber.get(),
                loadTestConfig.getSessionNamePrefix(), sessionNumber.get());

        if (this.needRecordingParticipant()) {
            state.setRecordingWorker(
                    loadTestService.setAndInitializeNextWorker(state.getRecordingWorker(),
                            WorkerType.RECORDING_WORKER));
            String targetWorker = useRecordingWorkerForRecordingParticipant ? state.getRecordingWorker()
                    : state.getWorker();
            return CompletableFuture.supplyAsync(
                    new LoadTestParticipantTask(this, browserEmulatorClient,
                            new UserInfo(targetWorker, userNumber.getAndIncrement(),
                                    sessionNumber.get(), role),
                            testCase, true, recordingMetadata),
                    executorService);
        }

        CompletableFuture<CreateParticipantResponse> future = CompletableFuture.supplyAsync(
                new LoadTestParticipantTask(this, browserEmulatorClient,
                        new UserInfo(state.getWorker(), userNumber.getAndIncrement(),
                                sessionNumber.get(), role),
                        testCase, false, null),
                executorService);
        state.setBrowsersInWorker(state.getBrowsersInWorker() + 1);
        return future;
    }

    private boolean shouldTrackAsyncStop(LoadTestParticipantRunState state) {
        boolean dontWait = !state.isWaitCompletion();
        if (state.getStartingParticipants() > 0) {
            dontWait = dontWait && state.isStartingParticipant();
        }
        return dontWait;
    }

    private void trackParticipantFuture(LoadTestParticipantRunState state,
            CompletableFuture<CreateParticipantResponse> future) {
        state.setTasksInProgress(state.getTasksInProgress() + 1);
        state.setParticipantCounter(state.getParticipantCounter() + 1);
        if (shouldTrackAsyncStop(state)) {
            future.thenAccept((CreateParticipantResponse response) -> {
                if (!response.isResponseOk()) {
                    state.setLastResponse(response);
                    state.setStop(true);
                }
            });
        }
        state.addToFutureList(future);
    }

    private boolean shouldWaitForResponses(LoadTestParticipantRunState state) {
        boolean waitWithoutBatches = !state.isBatches() && state.isWaitCompletion();
        boolean batchMaxCount = state.getTasksInProgress() >= state.getBatchMax();
        boolean waitForBatch = !state.isStartingParticipant() && state.isWaitCompletion() && batchMaxCount;
        return waitWithoutBatches || state.isLastStartingParticipant() || waitForBatch;
    }

    private CreateParticipantResponse flushParticipantResponses(LoadTestParticipantRunState state,
            boolean waitAfterFlush) {
        state.setLastResponse(loadTestService.getLastResponse(state.getFutureList()));
        CreateParticipantResponse lastResponseValue = state.getLastResponse();
        if ((lastResponseValue != null) && !lastResponseValue.isResponseOk()) {
            return lastResponseValue;
        }

        state.resetFutureList();
        state.setTasksInProgress(0);
        if (waitAfterFlush) {
            sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
            this.waitReconnectingUsersAfterParticipantBatch();
        }
        return null;
    }

    private void waitReconnectingUsersAfterParticipantBatch() {
        boolean isAnyReconnecting = browserEmulatorClient.isAnyParticipantReconnecting();
        boolean isNotReconnectingError = browserEmulatorClient.getLastErrorReconnectingResponse() == null;
        while (isAnyReconnecting && isNotReconnectingError) {
            sleeper.sleep(5, "waiting for reconnecting users");
            isAnyReconnecting = browserEmulatorClient.isAnyParticipantReconnecting();
            isNotReconnectingError = browserEmulatorClient.getLastErrorReconnectingResponse() == null;
        }
    }

    private CreateParticipantResponse evaluateAfterParticipant(LoadTestParticipantRunState state) {
        if (shouldWaitForResponses(state)) {
            return flushParticipantResponses(state, true);
        }
        if (!state.isWaitCompletion() && state.getStop()) {
            return state.getLastResponse();
        }
        return null;
    }

    private boolean needRecordingParticipant() {
        double medianodeLoadForRecording = loadTestConfig.getMedianodeLoadForRecording();
        int recordingSessionGroup = loadTestConfig.getRecordingSessionGroup();

        boolean isLoadRecordingEnabled = medianodeLoadForRecording > 0 && esClient.isInitialized()
                && !browserEmulatorClient.isRecordingParticipantCreated(sessionNumber.get())
                && esClient.getMediaNodeCpu() >= medianodeLoadForRecording;

        boolean isRecordingSessionGroupEnabled = recordingSessionGroup > 0
                && !browserEmulatorClient.isRecordingParticipantCreated(sessionNumber.get());

        return isLoadRecordingEnabled || isRecordingSessionGroupEnabled;
    }

    void cleanup() {
        this.sessionNumber.set(0);
        this.sessionsCompleted.set(0);
        this.totalParticipants.set(0);
        this.userNumber.set(1);
        this.userStartTimes.clear();
        this.allResponses.clear();
    }

    int getSessionNumber() {
        return sessionNumber.get();
    }

    int getSessionsCompleted() {
        return sessionsCompleted.get();
    }

    int incrementAndGetTotalParticipants() {
        return totalParticipants.incrementAndGet();
    }

    int getTotalParticipants() {
        return totalParticipants.get();
    }

    void addUserStartTime(Calendar startTime, String sessionId, String userId) {
        log.debug("addUserStartTime: sessionId={}, userId={}", sessionId, userId);
        List<String> sessionUserList = new ArrayList<>(2);
        sessionUserList.add(sessionId);
        sessionUserList.add(userId);
        // Ensure key uniqueness in case of duplicate timestamps using atomic putIfAbsent
        Calendar key = (Calendar) startTime.clone();
        while (this.userStartTimes.putIfAbsent(key, sessionUserList) != null) {
            key.add(Calendar.MILLISECOND, 1);
        }
    }

    Map<Calendar, List<String>> getUserStartTimes() {
        return userStartTimes;
    }

    void addParticipantResponse(CreateParticipantResponse response) {
        allResponses.add(response);
    }

    List<CreateParticipantResponse> getAllParticipantResponses() {
        return allResponses;
    }
}
