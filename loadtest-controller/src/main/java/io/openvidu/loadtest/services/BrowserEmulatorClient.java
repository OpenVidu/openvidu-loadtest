package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.net.ConnectException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Calendar;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.services.ec2.model.Instance;
import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.CreateParticipantErrorContext;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.UserInfo;
import io.openvidu.loadtest.models.testcase.request.InitializeRequestBody;
import io.openvidu.loadtest.models.testcase.request.QoeAnalysisBody;
import io.openvidu.loadtest.models.testcase.request.CreateUserRequestBody;
import io.openvidu.loadtest.models.testcase.request.CreateUserRequestBodyFactory;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class BrowserEmulatorClient {

    private static final String CONTENT_TYPE_APPLICATION_JSON = "application/json";
    private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorClient.class);
    private static final int HTTP_STATUS_OK = 200;
    private static final int WORKER_PORT = 5000;
    public static final String LOADTEST_INDEX = "loadtest-webrtc-stats-" + System.currentTimeMillis();
    private static Set<Integer> recordingParticipantCreated = new CopyOnWriteArraySet<>();
    private static Map<String, int[]> publishersAndSubscribersInWorker = new ConcurrentHashMap<>();

    private static final int WAIT_S = 1;
    private static final String CONTENT_TYPE_HEADER = "Content-Type";

    private LoadTestConfig loadTestConfig;

    private CustomHttpClient httpClient;

    private JsonUtils jsonUtils;

    private Sleeper sleeper;

    private WorkerUrlResolver workerUrlResolver;

    private ConcurrentHashMap<String, ConcurrentHashMap<String, AtomicInteger>> clientFailures = new ConcurrentHashMap<>();
    private ConcurrentHashMap<String, ConcurrentHashMap<String, Role>> clientRoles = new ConcurrentHashMap<>();
    private ConcurrentHashMap<String, TestCase> participantTestCases = new ConcurrentHashMap<>();
    private ConcurrentHashMap<String, AtomicBoolean> participantConnecting = new ConcurrentHashMap<>();
    private Set<String> participantReconnecting = new CopyOnWriteArraySet<>();
    private ConcurrentHashMap<String, Calendar> userDisconnectTimestamps = new ConcurrentHashMap<>();
    private Set<String> processingDisconnects = ConcurrentHashMap.newKeySet();

    private CreateParticipantResponse lastErrorReconnectingResponse;

    private AtomicBoolean endOfTest = new AtomicBoolean(false);

    private AtomicBoolean isClean = new AtomicBoolean(false);

    private String httpProtocolPrefix;

    public BrowserEmulatorClient(LoadTestConfig loadTestConfig, CustomHttpClient httpClient, JsonUtils jsonUtils,
            Sleeper sleeper, WorkerUrlResolver workerUrlResolver) {
        this.loadTestConfig = loadTestConfig;
        this.httpClient = httpClient;
        this.jsonUtils = jsonUtils;
        this.sleeper = sleeper;
        this.workerUrlResolver = workerUrlResolver;
        this.httpProtocolPrefix = loadTestConfig.isHttpsDisabled() ? "http://" : "https://";
    }

    public void clean() {
        this.isClean.set(true);
        this.clientFailures.clear();
        this.clientRoles.clear();
        this.participantTestCases.clear();
        this.participantConnecting.clear();
        this.participantReconnecting.clear();
        this.userDisconnectTimestamps.clear();
    }

    public void addDisconnectTimestamp(String userId, String sessionId) {
        String key = userId + "-" + sessionId;
        userDisconnectTimestamps.putIfAbsent(key, Calendar.getInstance());
    }

    public Map<String, Calendar> getPerUserDisconnectTimestamps() {
        return userDisconnectTimestamps;
    }

    public boolean isAnyParticipantReconnecting() {
        return !this.participantReconnecting.isEmpty();
    }

    public CreateParticipantResponse getLastErrorReconnectingResponse() {
        return this.lastErrorReconnectingResponse;
    }

    public void ping(String workerUrl) {
        try {
            String pingUrl = this.httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/instance/ping";
            log.info("Pinging to {} ...", pingUrl);
            HttpResponse<String> response = this.httpClient.sendGet(pingUrl, getHeaders());
            if (response.statusCode() != HTTP_STATUS_OK) {
                log.error("Error doing ping. Retry...");
                log.info("Ping response status code: {}", response.statusCode());
                if (log.isInfoEnabled()) {
                    log.info("Ping response body: {}", response.body());
                }
                sleeper.sleep(WAIT_S, null);
                ping(workerUrl);
            } else {
                if (log.isInfoEnabled()) {
                    log.info("Ping success. Response {}", response.body());
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Ping interrupted: {}", e.getMessage());
        } catch (Exception e) {
            if (e.getMessage() != null) {
                log.error(e.getMessage());
            } else {
                log.debug("Error doing ping", e);
            }
            log.error("Error doing ping. Retry...");
            ping(workerUrl);
        }
    }

    public HttpResponse<String> initializeInstance(String workerUrl) {
        JsonObject body = new InitializeRequestBody(this.loadTestConfig, LOADTEST_INDEX).toJson();
        try {
            log.info("Initialize worker {}", workerUrl);
            return this.httpClient.sendPost(
                    this.httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/instance/initialize", body,
                    null, getHeaders());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error(e.getMessage());
            return null;
        } catch (IOException e) {
            log.error(e.getMessage());
            sleeper.sleep(WAIT_S, "Error initializing worker " + workerUrl);
            if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
                log.warn("Retrying");
                return this.initializeInstance(workerUrl);
            }
        }
        return null;
    }

    public void addClientFailure(String workerUrl, String participant, String session) {
        addClientFailure(workerUrl, participant, session, false, true);
    }

    public void addClientFailure(String workerUrl, String participant, String session, boolean waitForConnection) {
        addClientFailure(workerUrl, participant, session, waitForConnection, true);
    }

    public void addClientFailure(String workerUrl, String participant, String session, boolean waitForConnection,
            boolean reconnect) {
        if (this.isClean.get()) {
            return;
        }
        String user = participant + "-" + session;
        ConcurrentHashMap<String, Role> workerRoles = this.clientRoles.get(workerUrl);
        if (workerRoles == null) {
            log.debug("Worker {} has no roles map, ignoring disconnect for {}", workerUrl, user);
            return;
        }
        if (!workerRoles.containsKey(user)) {
            log.debug("Worker {} doesn't have participant {}, ignoring disconnect", workerUrl, user);
            return;
        }
        if (!processingDisconnects.add(user)) {
            log.debug("Already processing disconnect for {}, ignoring duplicate", user);
            return;
        }
        log.info("Processing disconnect for {} on worker {}", user, workerUrl);
        log.debug("Adding client failure for participant {} in session {}", participant, session);
        log.debug("Wait for connection: {}", waitForConnection);
        AtomicBoolean isConnecting = this.participantConnecting.get(user);
        while (waitForConnection && isConnecting != null && isConnecting.get()) {
            if (endOfTest.get()) {
                return;
            }
            sleeper.sleep(WAIT_S, null);
        }
        ConcurrentHashMap<String, AtomicInteger> failures = this.clientFailures.computeIfAbsent(workerUrl,
                key -> new ConcurrentHashMap<>());
        AtomicInteger currentFailures = failures.computeIfAbsent(user, key -> new AtomicInteger(0));
        int newFailures = currentFailures.incrementAndGet();
        log.error("Participant {} in session {} failed {} times", participant, session, newFailures);
        log.debug("Retry mode: {}", this.loadTestConfig.isRetryMode());
        log.debug("Retry times: {}", this.loadTestConfig.getRetryTimes());
        log.debug("New failures: {}", newFailures);
        log.debug("Reconnect: {}", reconnect);
        this.addDisconnectTimestamp(participant, session);
        if (reconnect) {
            if (this.loadTestConfig.isRetryMode() && (newFailures < this.loadTestConfig.getRetryTimes())) {
                log.debug("Reconnecting participant {} in session {}", participant, session);
                this.reconnect(workerUrl, participant, session);
            } else {
                log.debug("Stop reconnecting participant {} in session {}", participant, session);
                this.lastErrorReconnectingResponse = new CreateParticipantResponse()
                        .setResponseOk(false)
                        .setStopReason("Participant " + participant + "-" + session + " failed after "
                                + newFailures + " retries");
            }
        }
    }

    private void reconnect(String workerUrl, String participant, String session) {
        this.participantReconnecting.add(participant + "-" + session);
        try (ExecutorService executorService = Executors.newFixedThreadPool(1)) {
            Callable<HttpResponse<String>> callableTask = () -> this.disconnectUser(workerUrl, participant, session);
            Future<HttpResponse<String>> future = executorService.submit(callableTask);
            HttpResponse<String> response = future.get();
            if ((response == null) || (response.statusCode() != HTTP_STATUS_OK)) {
                if (log.isErrorEnabled() && response != null) {
                    int statusCode = response.statusCode();
                    log.error("{}", statusCode);
                    log.error("{}", response.body());
                }
                throw new IllegalStateException(
                        "Error deleting participant " + participant + " from worker " + workerUrl);
            }
            afterDisconnect(workerUrl, participant, session);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            log.error("Reconnect interrupted: {}", ie.getMessage());
        } catch (ExecutionException ee) {
            ee.printStackTrace();
            log.error(ee.getCause().getMessage());
        } catch (Exception e) {
            log.error(e.getMessage());
        }
    }

    private void afterDisconnect(String workerUrl, String participant, String session) {
        log.debug("After disconnect user {} session {} in {}", participant, session, workerUrl);
        String user = participant + "-" + session;
        try {
            ConcurrentHashMap<String, Role> workerRoles = this.clientRoles.get(workerUrl);
            if (workerRoles == null) {
                log.debug("Worker roles is null for {} in session {} in {}. Waiting ...", participant, session, workerUrl);
                sleeper.sleep(WAIT_S, null);
                this.afterDisconnect(workerUrl, participant, session);
                return;
            }
            Role role = workerRoles.get(user);
            if (role == null) {
                log.warn("Role is null for {} in session {} in {}. This worker may not have this participant.", participant, session, workerUrl);
                return;
            }
            int userNumber = Integer.parseInt(participant.replace(loadTestConfig.getUserNamePrefix(), ""));
            int sessionNumber = Integer.parseInt(session.replace(loadTestConfig.getSessionNamePrefix(), ""));
            CreateParticipantResponse response = null;
            if (role.equals(Role.PUBLISHER)) {
                response = this.createPublisher(workerUrl, userNumber, sessionNumber, this.participantTestCases.get(user));
            } else {
                response = this.createSubscriber(workerUrl, userNumber, sessionNumber, this.participantTestCases.get(user));
            }
            if (response.isResponseOk()) {
                this.participantReconnecting.remove(user);
            } else {
                this.lastErrorReconnectingResponse = response;
                log.error("Response status is not 200 OK. Exit");
            }
        } finally {
            processingDisconnects.remove(user);
        }
    }

    private HttpResponse<String> disconnectUser(String workerUrl, String participant, String session) {
        try {
            log.info("Deleting participant {} from worker {}", participant, workerUrl);
            Map<String, String> headers = new HashMap<>();
            headers.put(CONTENT_TYPE_HEADER, CONTENT_TYPE_APPLICATION_JSON);
            HttpResponse<String> response = this.httpClient.sendDelete(
                    this.httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager/session/"
                            + session
                            + "/user/" + participant,
                    headers);
            log.info("Participant {} in worker {} deleted", participant, workerUrl);
            return response;
        } catch (ConnectException e) {
            log.error("Connection refused (ConnectException)");
            e.printStackTrace();
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error(e.getMessage());
            return null;
        } catch (IOException e) {
            log.error(e.getMessage());
            return null;
        }
    }

    private void addClient(String workerUrl, int userNumber, int sessionNumber, Role role, TestCase testCase) {
        ConcurrentHashMap<String, Role> roles = this.clientRoles.computeIfAbsent(workerUrl,
                key -> new ConcurrentHashMap<>());
        String participant = this.loadTestConfig.getUserNamePrefix() + userNumber;
        String session = this.loadTestConfig.getSessionNamePrefix() + sessionNumber;
        String user = participant + "-" + session;
        roles.put(user, role);

        this.participantTestCases.put(user, testCase);
    }

    public CreateParticipantResponse createPublisher(String worker, int userNumber, int sessionNumber,
            TestCase testCase) {
        TestCase finalTestCase = testCase;
        if (testCase.isBrowserRecording()) {
            finalTestCase = new TestCase(testCase);
            finalTestCase.setBrowserRecording(false);
        }
        CreateParticipantResponse success = this.createParticipant(worker, userNumber, sessionNumber,
                finalTestCase, Role.PUBLISHER);
        this.addClient(worker, userNumber, sessionNumber, Role.PUBLISHER, testCase);
        return success;
    }

    public CreateParticipantResponse createSubscriber(String worker, int userNumber, int sessionNumber,
            TestCase testCase) {
        TestCase finalTestCase = testCase;
        if (testCase.isBrowserRecording()) {
            finalTestCase = new TestCase(testCase);
            finalTestCase.setBrowserRecording(false);
        }
        Role role = Role.SUBSCRIBER;
        CreateParticipantResponse success = this.createParticipant(worker, userNumber, sessionNumber,
                finalTestCase, role);

        this.addClient(worker, userNumber, sessionNumber, Role.SUBSCRIBER, testCase);
        return success;
    }

    public CreateParticipantResponse createExternalRecordingPublisher(String worker, int userNumber, int sessionNumber,
            TestCase testCase, String recordingMetadata) {
        return this.createExternalRecordingParticipant(worker, userNumber, sessionNumber, testCase,
                recordingMetadata, Role.PUBLISHER);
    }

    public CreateParticipantResponse createExternalRecordingSubscriber(String worker, int userNumber, int sessionNumber,
            TestCase testCase, String recordingMetadata) {
        return this.createExternalRecordingParticipant(worker, userNumber, sessionNumber, testCase,
                recordingMetadata, Role.SUBSCRIBER);
    }

    public void disconnectAll(List<String> workerUrlList) {
        if (workerUrlList == null || workerUrlList.isEmpty()) {
            log.info("No workers to disconnect");
            return;
        }
        try (ExecutorService executorService = Executors.newFixedThreadPool(workerUrlList.size())) {
            List<Callable<String>> callableTasks = new ArrayList<>();
            for (String workerUrl : workerUrlList) {
                Callable<String> callableTask = () -> this.disconnect(workerUrl);
                callableTasks.add(callableTask);
            }
            List<Future<String>> futures = executorService.invokeAll(callableTasks);
            for (Future<String> future : futures) {
                getFuture(future);
            }
            recordingParticipantCreated.clear();
            log.info("Participants disconnected");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Disconnect all interrupted: {}", e.getMessage());
        }
    }

    private void getFuture(Future<String> future) throws InterruptedException {
        try {
            log.info(future.get());
        } catch (ExecutionException ee) {
            log.error("Error getting future result", ee);
        }
    }

    public boolean isRecordingParticipantCreated(int sessionNumber) {
        return recordingParticipantCreated.contains(sessionNumber);
    }

    private String disconnect(String workerUrl) {
        try {
            log.info("Deleting all participants from worker {}", workerUrl);
            Map<String, String> headers = new HashMap<>();
            headers.put(CONTENT_TYPE_HEADER, CONTENT_TYPE_APPLICATION_JSON);
            HttpResponse<String> response = this.httpClient.sendDelete(
                    this.httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager",
                    headers);
            log.info("Participants in worker {} deleted", workerUrl);
            return response.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error(e.getMessage());
            return null;
        } catch (IOException e) {
            log.error(e.getMessage());
            return null;
        }
    }

    private CreateParticipantResponse createParticipant(String workerUrl, int userNumber, int sessionNumber,
            TestCase testCase, Role role) {
        // Get current failures if registered
        String userId = this.loadTestConfig.getUserNamePrefix() + userNumber;
        String sessionId = this.loadTestConfig.getSessionNamePrefix() + sessionNumber;
        String user = userId + "-" + sessionId;

        this.participantConnecting.put(user, new AtomicBoolean(true));

        CreateParticipantResponse cpr = new CreateParticipantResponse();

        String sessionSuffix = String.valueOf(sessionNumber);
        CreateUserRequestBody body = this.generateRequestBody(userNumber, sessionSuffix, role, testCase);
        try {
            log.info("Selected worker: {}", workerUrl);
            log.info("Creating participant {} in session {}", userNumber, sessionSuffix);
            HttpResponse<String> response = this.httpClient.sendPost(
                    this.httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager",
                    body.toJson(), null,
                    getHeaders());
            if (log.isDebugEnabled()) {
                log.debug(body.toJson().toString());
                log.debug("Response received: {}", response.body());
            }
            if (isClean.get()) {
                // The test has finished
                return cpr.setResponseOk(false);
            }
            if (response.statusCode() != HTTP_STATUS_OK) {
                if (log.isWarnEnabled()) {
                    log.warn("Error: {}", response.body());
                }

                ConcurrentHashMap<String, AtomicInteger> failuresMap = this.clientFailures.computeIfAbsent(workerUrl,
                        key -> new ConcurrentHashMap<>());
                AtomicInteger userFailures = failuresMap.computeIfAbsent(user, key -> new AtomicInteger(0));
                int failures = userFailures.incrementAndGet();
                log.error("Participant {} in session {} failed {} times", userId, sessionId, failures);
                sleeper.sleep(WAIT_S, null);
                if (!loadTestConfig.isRetryMode() || isResponseLimitReached(failures) || endOfTest.get()) {
                    String reason = "Participant " + userId + "-" + sessionId + " failed after "
                            + failures + " retries";
                    // Set lastErrorReconnectingResponse to trigger test termination
                    this.lastErrorReconnectingResponse = new CreateParticipantResponse()
                            .setResponseOk(false)
                            .setStopReason(reason);
                    // Also set stopReason on the returned response to avoid race condition
                    // where getLastResponse() may return this object before lastErrorReconnectingResponse is visible
                    return cpr.setResponseOk(false).setStopReason(reason);
                }
                log.warn("Retrying");
                return this.createParticipant(workerUrl, userNumber, sessionNumber, testCase, role);
            } else {
                this.participantConnecting.get(user).set(false);
                this.saveParticipantData(workerUrl, testCase.isTeaching() ? Role.PUBLISHER : role);
            }
            return processResponse(response, workerUrl);
        } catch (Exception e) {
            CreateParticipantErrorContext ctx = new CreateParticipantErrorContext(
                    new UserInfo(workerUrl, userNumber, sessionNumber, role, userId, sessionId), testCase, cpr);
            return this.handleCreateParticipantErrors(ctx, e);
        }

    }

    private CreateParticipantResponse handleCreateParticipantErrors(CreateParticipantErrorContext ctx, Exception e) {
        if (e.getMessage() != null && e.getMessage().contains("timed out")) {
            log.info("Timeout error trying connect with worker on {}: {}", ctx.getUserInfo().getWorkerUrl(),
                    e.getMessage());
            this.addClientFailure(ctx.getUserInfo().getWorkerUrl(), ctx.getUserInfo().getUserId(),
                    ctx.getUserInfo().getSessionId(), false, false);
            sleeper.sleep(WAIT_S, "Timeout error. Retrying...");
            return this.createParticipant(ctx.getUserInfo().getWorkerUrl(), ctx.getUserInfo().getUserNumber(),
                    ctx.getUserInfo().getSessionNumber(), ctx.getTestCase(), ctx.getUserInfo().getRole());
        } else if (e.getMessage() != null && e.getMessage().equalsIgnoreCase("refused")) {
            log.error("Error trying connect with worker on {}: {}", ctx.getUserInfo().getWorkerUrl(), e.getMessage());
            this.addClientFailure(ctx.getUserInfo().getWorkerUrl(), ctx.getUserInfo().getUserId(),
                    ctx.getUserInfo().getSessionId(), false, false);
            sleeper.sleep(WAIT_S, "Connection refused. Retrying...");
            return this.createParticipant(ctx.getUserInfo().getWorkerUrl(), ctx.getUserInfo().getUserNumber(),
                    ctx.getUserInfo().getSessionNumber(), ctx.getTestCase(), ctx.getUserInfo().getRole());
        } else if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
            log.error("{}: {}", ctx.getUserInfo().getWorkerUrl(), e.getMessage());
            return ctx.getCpr().setResponseOk(true);
        }
        e.printStackTrace();
        return ctx.getCpr().setResponseOk(false);
    }

    private void saveParticipantData(String workerUrl, Role role) {
        int[] initialArray = { 0, 0 };
        BrowserEmulatorClient.publishersAndSubscribersInWorker.putIfAbsent(workerUrl, initialArray);
        int[] list = BrowserEmulatorClient.publishersAndSubscribersInWorker.get(workerUrl);
        if (role.equals(Role.PUBLISHER)) {
            list[0] = list[0] + 1;
        } else {
            list[1] = list[1] + 1;
        }
    }

    private CreateParticipantResponse createExternalRecordingParticipant(String worker, int userNumber,
            int sessionNumber,
            TestCase testCase, String recordingMetadata, Role role) {

        TestCase testCaseAux = new TestCase(testCase);
        testCaseAux.setBrowserRecording(true);
        testCaseAux.setRecordingMetadata(recordingMetadata);
        log.info("Creating a participant using a REAL BROWSER for recoding");
        CreateParticipantResponse okResponse = this.createParticipant(worker, userNumber,
                sessionNumber, testCaseAux, role);
        if (okResponse.isResponseOk()) {
            recordingParticipantCreated.add(sessionNumber);
        }
        return okResponse;
    }

    private CreateParticipantResponse processResponse(HttpResponse<String> response, String workerUrl) {
        CreateParticipantResponse cpr = new CreateParticipantResponse();
        if (response != null && response.statusCode() == HTTP_STATUS_OK) {
            JsonObject jsonResponse = jsonUtils.getJson(response.body());
            String connectionId = jsonResponse.get("connectionId").getAsString();
            double workerCpuPct = jsonResponse.get("workerCpuUsage").getAsDouble();
            int streamsInWorker = jsonResponse.get("streams").getAsInt();
            int participantsInWorker = jsonResponse.get("participants").getAsInt();
            String userId = jsonResponse.has("userId") && !jsonResponse.get("userId").isJsonNull()
                    ? jsonResponse.get("userId").getAsString()
                    : "";
            String sessionId = jsonResponse.has("sessionId") && !jsonResponse.get("sessionId").isJsonNull()
                    ? jsonResponse.get("sessionId").getAsString()
                    : "";
            log.info("Connection {} created for user {} and session {}", connectionId, userId, sessionId);
            return cpr.setResponseOk(true).setConnectionId(connectionId)
                    .setUserId(userId).setSessionId(sessionId)
                    .setWorkerCpuPct(workerCpuPct).setStreamsInWorker(streamsInWorker)
                    .setParticipantsInWorker(participantsInWorker)
                    .setWorkerUrl(workerUrl);
        }
        if (response == null) {
            log.error("Error. Response is null");
            return cpr.setResponseOk(false).setStopReason("No response from worker");
        }
        if (log.isErrorEnabled()) {
            log.error("Error. Http Status Response {} ", response.statusCode());
            log.error("Response message {} ", response.body());
        }
        String stopReason = response.body().substring(0, 100);
        return cpr.setResponseOk(false).setStopReason(stopReason);
    }

    private boolean isResponseLimitReached(int failures) {
        return failures == loadTestConfig.getRetryTimes();
    }

    private CreateUserRequestBody generateRequestBody(int userNumber, String sessionNumber, Role role,
            TestCase testCase) {
        boolean video = (testCase.isTeaching() && role.equals(Role.PUBLISHER)) || !testCase.isTeaching();
        Role actualRole = testCase.isTeaching() ? Role.PUBLISHER : role;
        boolean audio = true;
        String userId = this.loadTestConfig.getUserNamePrefix() + userNumber;
        String sessionId = this.loadTestConfig.getSessionNamePrefix() + sessionNumber;

        return CreateUserRequestBodyFactory.create(loadTestConfig, testCase, video, audio, actualRole, userId,
                sessionId);
    }

    private Map<String, String> getHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put(CONTENT_TYPE_HEADER, CONTENT_TYPE_APPLICATION_JSON);
        return headers;
    }

    public int getRoleInWorker(String workerUrl, Role role) {
        Integer idx = role.equals(Role.PUBLISHER) ? 0 : 1;
        int[] initialArray = { 0, 0 };
        BrowserEmulatorClient.publishersAndSubscribersInWorker
                .putIfAbsent(workerUrl, initialArray);
        return BrowserEmulatorClient.publishersAndSubscribersInWorker
                .get(workerUrl)[idx];
    }

    public void calculateQoe(List<Instance> workersList) {
        try (ExecutorService executorService = Executors.newFixedThreadPool(workersList.size())) {
            List<String> workerUrlsList = workerUrlResolver.resolveUrls(workersList);
            List<Callable<String>> callableTasks = new ArrayList<>();
            for (String workerUrl : workerUrlsList) {
                Callable<String> callable = new Callable<String>() {
                    @Override
                    public String call() throws Exception {
                        return httpClient.sendPost(
                                httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/qoe/analysis",
                                new QoeAnalysisBody(loadTestConfig).toJson(), null,
                                getHeaders()).body();
                    }
                };
                callableTasks.add(callable);
            }
            List<Future<String>> futures = executorService.invokeAll(callableTasks);
            List<Integer> remainingFilesList = new ArrayList<>(futures.size());
            for (Future<String> future : futures) {
                String response = future.get();
                JsonObject jsonResponse = jsonUtils.getJson(response);
                int remainingFiles = jsonResponse.get("remainingFiles").getAsInt();
                remainingFilesList.add(remainingFiles);
            }
            log.info("Waiting for all workers to finish QoE analysis (list of remaining files): {}",
                    remainingFilesList);
            boolean allDone = false;
            while (!allDone) {
                allDone = true;
                List<Callable<String>> statusCallableTasks = new ArrayList<>();
                for (String workerUrl : workerUrlsList) {
                    Callable<String> callable = new Callable<String>() {
                        @Override
                        public String call() throws Exception {
                            return httpClient.sendGet(
                                    httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/qoe/analysis/status",
                                    getHeaders())
                                    .body();
                        }
                    };
                    statusCallableTasks.add(callable);
                }
                List<Future<String>> statusFutures = executorService.invokeAll(statusCallableTasks);
                List<Integer> currentRemainingFilesList = new ArrayList<>(statusFutures.size());
                for (Future<String> future : statusFutures) {
                    String response = future.get();
                    JsonObject jsonResponse = jsonUtils.getJson(response);
                    int remainingFiles = jsonResponse.get("remainingFiles").getAsInt();
                    currentRemainingFilesList.add(remainingFiles);
                    if (remainingFiles != 0) {
                        allDone = false;
                    }
                }
                if (!allDone) {
                    log.info("Waiting for all workers to finish QoE analysis (list of remaining files): {}",
                            currentRemainingFilesList);
                }
            }
            log.info("Finished QoE Analysis, results can be found in the S3 Bucket");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("QoE calculation interrupted: {}", e.getMessage());
        } catch (Exception e) {
            log.error(e.getMessage());
        }
    }

    public void setEndOfTest(boolean isEndOfTest) {
        this.endOfTest.set(isEndOfTest);
    }

    public int[] getRetryStatistics() {
        int totalRetries = 0;
        int successfulRetries = 0;
        for (Map.Entry<String, ConcurrentHashMap<String, AtomicInteger>> workerEntry : clientFailures.entrySet()) {
            String workerUrl = workerEntry.getKey();
            ConcurrentHashMap<String, AtomicInteger> userFailures = workerEntry.getValue();
            ConcurrentHashMap<String, Role> workerRoles = clientRoles.get(workerUrl);
            for (Map.Entry<String, AtomicInteger> userEntry : userFailures.entrySet()) {
                String userSession = userEntry.getKey();
                int failures = userEntry.getValue().get();
                totalRetries += failures;
                if (workerRoles != null && workerRoles.containsKey(userSession) && failures > 0) {
                    successfulRetries++;
                }
            }
        }
        return new int[] { totalRetries, successfulRetries };
    }

    public int getMaxRetriesPerParticipant() {
        int max = 0;
        for (ConcurrentHashMap<String, AtomicInteger> userFailures : clientFailures.values()) {
            for (AtomicInteger failures : userFailures.values()) {
                int f = failures.get();
                if (f > max)
                    max = f;
            }
        }
        return max;
    }

    public Map<String, Integer> getPerUserRetryCounts() {
        Map<String, Integer> counts = new HashMap<>();
        for (ConcurrentHashMap<String, AtomicInteger> userFailures : clientFailures.values()) {
            for (Map.Entry<String, AtomicInteger> entry : userFailures.entrySet()) {
                String userSession = entry.getKey();
                int failures = entry.getValue().get();
                counts.merge(userSession, failures, Integer::sum);
            }
        }
        return counts;
    }

    public void shutdownWorkers(List<String> workerUrls, boolean waitForResponse) {
        if (workerUrls == null || workerUrls.isEmpty()) {
            return;
        }

        try (ExecutorService executorService = Executors.newFixedThreadPool(Math.min(workerUrls.size(), 10))) {
            List<Future<Void>> futures = new ArrayList<>();

            for (String workerUrl : workerUrls) {
                Callable<Void> callable = () -> {
                    try {
                        httpClient.sendDelete(
                                httpProtocolPrefix + workerUrl + ":" + WORKER_PORT + "/instance/shutdown",
                                getHeaders());
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        log.warn("Failed to send shutdown request to worker {}: {}", workerUrl, e.getMessage());
                    }
                    return null;
                };
                futures.add(executorService.submit(callable));
            }

            if (waitForResponse) {
                // Wait for all futures to complete with a timeout
                try {
                    for (Future<Void> future : futures) {
                        future.get(5, TimeUnit.MINUTES); // 5 minute timeout
                    }
                } catch (TimeoutException e) {
                    log.warn("Timeout waiting for worker shutdown responses: {}", e.getMessage());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.warn("Interrupted while waiting for worker shutdown responses: {}", e.getMessage());
                } catch (ExecutionException e) {
                    log.warn("Error while waiting for worker shutdown responses: {}", e.getMessage());
                }
            }
        }

    }
}
