package io.openvidu.loadtest.services.core;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CompletableFuture;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.Sleeper;
import io.openvidu.loadtest.services.WebSocketClient;
import io.openvidu.loadtest.services.WebSocketConnectionFactory;
import io.openvidu.loadtest.utils.DataIO;

/**
 * @author Carlos Santos & Iván Chicano
 *
 */

@Service
public class LoadTestService {
    private static final Logger log = LoggerFactory.getLogger(LoadTestService.class);

    private BrowserEmulatorClient browserEmulatorClient;
    private LoadTestConfig loadTestConfig;
    private KibanaClient kibanaClient;
    private ElasticSearchClient esClient;
    private Ec2Client ec2Client;
    private Sleeper sleeper;
    private WebSocketConnectionFactory webSocketConnectionFactory;
    private final LoadTestWorkerLifecycleOrchestrator workerLifecycleOrchestrator;
    private final LoadTestEstimationOrchestrator estimationOrchestrator;
    private final LoadTestShutdownOrchestrator shutdownOrchestrator;
    private final LoadTestParticipantOrchestrator participantOrchestrator;
    private final LoadTestTopologyOrchestrator topologyOrchestrator;

    private DataIO io;

    private List<Instance> awsWorkersList = new ArrayList<>();
    private List<String> devWorkersList = new ArrayList<>();
    private List<Instance> recordingWorkersList = new ArrayList<>();

    private Calendar startTime;
    private final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    private static final int WEBSOCKET_PORT = 5001;

    private boolean prodMode = false;

    // TODO: Reimplement calculation of streams per worker

    public LoadTestService(BrowserEmulatorClient browserEmulatorClient, LoadTestConfig loadTestConfig,
            KibanaClient kibanaClient, ElasticSearchClient esClient, Ec2Client ec2Client,
            WebSocketConnectionFactory webSocketConnectionFactory, DataIO dataIO, Sleeper sleeper) {
        this.browserEmulatorClient = browserEmulatorClient;
        this.loadTestConfig = loadTestConfig;
        this.kibanaClient = kibanaClient;
        this.esClient = esClient;
        this.ec2Client = ec2Client;
        this.webSocketConnectionFactory = webSocketConnectionFactory;
        this.io = dataIO;
        this.sleeper = sleeper;
        this.workerLifecycleOrchestrator = new LoadTestWorkerLifecycleOrchestrator(this, ec2Client, loadTestConfig);
        this.estimationOrchestrator = new LoadTestEstimationOrchestrator(this, browserEmulatorClient,
                loadTestConfig, sleeper);
        this.shutdownOrchestrator = new LoadTestShutdownOrchestrator(this, browserEmulatorClient, ec2Client,
                loadTestConfig);
        this.participantOrchestrator = new LoadTestParticipantOrchestrator(this, browserEmulatorClient, esClient,
                loadTestConfig, sleeper);
        this.topologyOrchestrator = new LoadTestTopologyOrchestrator(this, loadTestConfig, kibanaClient);

        prodMode = loadTestConfig.getWorkerUrlList().isEmpty();
        devWorkersList = loadTestConfig.getWorkerUrlList();
    }

    String setAndInitializeNextWorker(String currentWorker, WorkerType workerType)
            throws NoWorkersAvailableException {
        return workerLifecycleOrchestrator.setAndInitializeNextWorker(currentWorker, workerType);
    }

    void initializeInstance(String url) {
        browserEmulatorClient.ping(url);
        WebSocketClient ws = webSocketConnectionFactory
                .createConnection("ws://" + url + ":" + LoadTestService.WEBSOCKET_PORT + "/events");
        shutdownOrchestrator.addWebSocketSession(ws);
        browserEmulatorClient.initializeInstance(url);
    }

    boolean estimate(boolean instancesInitialized, TestCase testCase, int publishers,
            int subscribers) {
        return estimationOrchestrator.estimate(instancesInitialized, this.getWorkerUrlForEstimation(), testCase,
                publishers, subscribers);
    }

    boolean launchInitialInstances() {
        return workerLifecycleOrchestrator.launchInitialInstances();
    }

    boolean checkEnoughWorkers(int sessions, int participants) {
        int workersAvailable = prodMode ? loadTestConfig.getWorkersNumberAtTheBeginning() : devWorkersList.size();
        int workersRumpUp = prodMode ? loadTestConfig.getWorkersRumpUp() : 0;
        int nParticipants = sessions * participants;
        int estimatedParticipants = getBrowserEstimation() * workersAvailable;
        if (workersRumpUp < 1 && (sessions == -1 || (nParticipants > estimatedParticipants))) {
            String warning = "Number of available workers might not be enough to host all users ("
                    + (nParticipants < 0 ? "infinite" : nParticipants)
                    + " participants trying to fit in " + workersAvailable + " worker at "
                    + getBrowserEstimation()
                    + " browsers per worker). The test will stop when there are no more workers available.";
            log.warn(warning);
        }

        return true;
    }

    public void startLoadTests(List<TestCase> testCasesList) {
        topologyOrchestrator.startLoadTests(testCasesList);
    }

    CreateParticipantResponse startOneSessionNxNTest(TestCase testCase) throws NoWorkersAvailableException {
        return participantOrchestrator.startOneSessionNxNTest(testCase);
    }

    CreateParticipantResponse startOneSessionXxNTest(int publishers, TestCase testCase)
            throws NoWorkersAvailableException {
        return participantOrchestrator.startOneSessionXxNTest(publishers, testCase);
    }

    CreateParticipantResponse startNxNTest(int participantsBySession, TestCase testCase)
            throws NoWorkersAvailableException {
        return participantOrchestrator.startNxNTest(participantsBySession, testCase);
    }

    CreateParticipantResponse startNxMTest(int publishers, int subscribers, TestCase testCase)
            throws NoWorkersAvailableException {
        return participantOrchestrator.startNxMTest(publishers, subscribers, testCase);
    }

    private String getWorkerUrlForEstimation() {
        return prodMode ? awsWorkersList.get(0).publicDnsName() : devWorkersList.get(0);
    }

    boolean isProdMode() {
        return prodMode;
    }

    int getBrowserEstimation() {
        return estimationOrchestrator.getBrowserEstimation();
    }

    void setEstimationBrowserEstimation(int value) {
        estimationOrchestrator.setBrowserEstimation(value);
    }

    void setStartTimeNow() {
        this.startTime = Calendar.getInstance();
    }

    void completeTestAndSave(TestCase testCase, String participantsBySession, CreateParticipantResponse lastCPR) {
        browserEmulatorClient.setEndOfTest(true);
        sleeper.sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
        this.saveResultReport(testCase, participantsBySession, lastCPR);
    }

    void cleanupAfterParticipantConfiguration() {
        this.disconnectAllSessions();
        this.cleanEnvironment();
    }

    void terminateAllInstances() {
        ec2Client.terminateAllInstances();
    }

    boolean hasInitialWorkersAvailable() {
        int workersAvailable = prodMode ? loadTestConfig.getWorkersNumberAtTheBeginning() : devWorkersList.size();
        int workersRumpUp = loadTestConfig.getWorkersRumpUp();
        return workersAvailable != 0 || (prodMode && workersRumpUp > 0);
    }

    List<Instance> getAwsWorkersList() {
        return awsWorkersList;
    }

    List<Instance> getRecordingWorkersList() {
        return recordingWorkersList;
    }

    List<String> getDevWorkersList() {
        return devWorkersList;
    }

    List<Date> getWorkerLifecycleOrchestratorWorkerStartTimes() {
        return workerLifecycleOrchestrator.getWorkerStartTimes();
    }

    List<Date> getWorkerLifecycleOrchestratorRecordingWorkerStartTimes() {
        return workerLifecycleOrchestrator.getRecordingWorkerStartTimes();
    }

    void resetProdWorkers() {
        awsWorkersList = new ArrayList<>();
        recordingWorkersList = new ArrayList<>();
    }

    CreateParticipantResponse getLastResponse(List<CompletableFuture<CreateParticipantResponse>> futureList) {
        CreateParticipantResponse reconnectingResponse = browserEmulatorClient.getLastErrorReconnectingResponse();
        if (reconnectingResponse != null) {
            return reconnectingResponse;
        }
        CreateParticipantResponse lastResponse = null;
        for (CompletableFuture<CreateParticipantResponse> future : futureList) {
            try {
                log.debug("Waiting for future {}", future);
                CreateParticipantResponse futureResponse = future.get();
                if (!futureResponse.isResponseOk()) {
                    lastResponse = futureResponse;
                    break;
                }
                if ((lastResponse == null) || (futureResponse.getStreamsInWorker() >= lastResponse
                        .getStreamsInWorker())) {
                    lastResponse = futureResponse;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.error("Interrupted while waiting for future {}, {}", future, e);
            } catch (ExecutionException e) {
                log.error("Execution exception while waiting for future {}, {}", future, e);
            }
        }
        return lastResponse;
    }

    private void cleanEnvironment() {
        participantOrchestrator.cleanup();
        workerLifecycleOrchestrator.cleanup();
        estimationOrchestrator.cleanup();
        shutdownOrchestrator.cleanup();
        browserEmulatorClient.clean();
        sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenTestCases(), "time cleaning environment");
        waitToMediaServerLiveAgain();
        browserEmulatorClient.setEndOfTest(false);
    }

    private void waitToMediaServerLiveAgain() {
        if (esClient.isInitialized()) {
            while (esClient.getMediaNodeCpu() > 5.00) {
                sleeper.sleep(5, "Waiting MediaServer recovers his CPU");
            }
        } else {
            sleeper.sleep(5, "Waiting MediaServer recovers his CPU");
        }
    }

    private void disconnectAllSessions() {
        shutdownOrchestrator.disconnectAllSessions();
    }

    private void saveResultReport(TestCase testCase, String participantsBySession, CreateParticipantResponse lastCPR) {
        Calendar endTime = Calendar.getInstance();
        endTime.add(Calendar.SECOND, loadTestConfig.getSecondsToWaitBetweenTestCases());
        endTime.add(Calendar.SECOND, 10);

        // Parse date to match with Kibana time filter
        String startTimeStr = formatter.format(this.startTime.getTime()).replace(" ", "T") + "Z";
        String endTimeStr = formatter.format(endTime.getTime()).replace(" ", "T") + "Z";
        String kibanaUrl = kibanaClient.getDashboardUrl(startTimeStr, endTimeStr);
        String stopReason = lastCPR.getStopReason();
        if (stopReason == null) {
            stopReason = "Test finished";
        }
        String videoControl = "None";
        if ((loadTestConfig.getS3BucketName() != null) && !loadTestConfig.getS3BucketName().equals("")) {
            if (loadTestConfig.getS3Host() != null && !loadTestConfig.getS3Host().isEmpty()) {
                videoControl = loadTestConfig.getS3Host() + "/" + loadTestConfig.getS3BucketName();
            } else {
                videoControl = "https://s3.console.aws.amazon.com/s3/buckets/" + loadTestConfig.getS3BucketName();
            }
        }
        // Compute per-user success timestamps
        Map<String, Calendar> userSuccessTimestamps = new HashMap<>();
        log.debug("Computing per-user success timestamps. getUserStartTimes size: {}",
                participantOrchestrator.getUserStartTimes().size());
        for (Map.Entry<Calendar, List<String>> entry : participantOrchestrator.getUserStartTimes().entrySet()) {
            Calendar timestamp = entry.getKey();
            List<String> sessionUser = entry.getValue();
            log.debug("Entry: timestamp={}, sessionUser={}", timestamp, sessionUser);
            log.debug("sessionUser size: {}", sessionUser.size());
            if (sessionUser.size() >= 2) {
                String sessionId = sessionUser.get(0);
                String userId = sessionUser.get(1);
                log.debug("sessionId={}, userId={}", sessionId, userId);
                String key = userId + "-" + sessionId;
                log.debug("Adding key: {}", key);
                userSuccessTimestamps.put(key, timestamp);
            } else {
                log.warn("sessionUser size less than 2: {}", sessionUser);
            }
        }
        log.debug("userSuccessTimestamps size: {}", userSuccessTimestamps.size());
        if (userSuccessTimestamps.isEmpty()) {
            log.warn("userSuccessTimestamps is empty. This may cause missing rows in the HTML report.");
            // Attempt fallback: try both orders of sessionId and userId
            for (Map.Entry<Calendar, List<String>> entry : participantOrchestrator.getUserStartTimes().entrySet()) {
                Calendar timestamp = entry.getKey();
                List<String> sessionUser = entry.getValue();
                if (sessionUser.size() >= 2) {
                    String first = sessionUser.get(0);
                    String second = sessionUser.get(1);
                    // Try second-first order (userId-sessionId) - typical expectation
                    String key1 = second + "-" + first;
                    log.warn("Fallback adding key (userId-sessionId): {}", key1);
                    userSuccessTimestamps.put(key1, timestamp);
                    // Try first-second order (sessionId-userId) just in case
                    String key2 = first + "-" + second;
                    log.warn("Fallback adding key (sessionId-userId): {}", key2);
                    userSuccessTimestamps.put(key2, timestamp);
                }
            }
            log.warn("After fallback, userSuccessTimestamps size: {}", userSuccessTimestamps.size());
        }

        ResultReport rr = new ResultReport().setTotalParticipants(participantOrchestrator.getTotalParticipants())
                .setNumSessionsCompleted(participantOrchestrator.getSessionsCompleted())
                .setNumSessionsCreated(participantOrchestrator.getSessionNumber())
                .setWorkersUsed(workerLifecycleOrchestrator.getWorkersUsed())
                .setSessionTopology(testCase.getTopology().toString())
                .setOpenviduRecording(testCase.getOpenviduRecordingMode().toString())
                .setBrowserRecording(testCase.isBrowserRecording()).setParticipantsPerSession(participantsBySession)
                .setStopReason(stopReason).setStartTime(this.startTime)
                .setEndTime(endTime).setKibanaUrl(kibanaUrl)
                .setManualParticipantAllocation(loadTestConfig.isManualParticipantsAllocation())
                .setUsersPerWorker(loadTestConfig.getUsersPerWorker())
                .setS3BucketName(videoControl)
                .setTimePerWorker(shutdownOrchestrator.getWorkerTimes())
                .setTimePerRecordingWorker(shutdownOrchestrator.getRecordingWorkerTimes())
                .setUserStartTimes(participantOrchestrator.getUserStartTimes())
                .setUserSuccessTimestamps(userSuccessTimestamps)
                .build();

        io.exportResults(rr);

    }

}
