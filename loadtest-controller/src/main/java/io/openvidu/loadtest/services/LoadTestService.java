package io.openvidu.loadtest.services;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.monitoring.KibanaClient;
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

    private DataIO io;

    private List<Instance> awsWorkersList = new ArrayList<>();
    private List<String> devWorkersList = new ArrayList<>();
    private List<Instance> recordingWorkersList = new ArrayList<>();
    private Queue<WebSocketClient> wsSessions = new ConcurrentLinkedQueue<>();

    private List<Date> workerStartTimes = new ArrayList<>();
    private List<Date> recordingWorkerStartTimes = new ArrayList<>();
    private List<Long> workerTimes = new ArrayList<>();
    private List<Long> recordingWorkerTimes = new ArrayList<>();

    private int workersUsed = 0;

    private Calendar startTime;
    private final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    private static final int WEBSOCKET_PORT = 5001;

    private boolean prodMode = false;
    private AtomicInteger sessionNumber = new AtomicInteger(0);
    private AtomicInteger userNumber = new AtomicInteger(1);
    private AtomicInteger sessionsCompleted = new AtomicInteger(0);
    private AtomicInteger totalParticipants = new AtomicInteger(0);

    private int browserEstimation = -1;

    // TODO: Reimplement calculation of streams per worker
    private Map<Calendar, List<String>> userStartTimes = new ConcurrentHashMap<>();

    public LoadTestService(BrowserEmulatorClient browserEmulatorClient, LoadTestConfig loadTestConfig,
            KibanaClient kibanaClient, ElasticSearchClient esClient, Ec2Client ec2Client,
            WebSocketConnectionFactory webSocketConnectionFactory,
            DataIO dataIO, Sleeper sleeper) {
        this.browserEmulatorClient = browserEmulatorClient;
        this.loadTestConfig = loadTestConfig;
        this.kibanaClient = kibanaClient;
        this.esClient = esClient;
        this.ec2Client = ec2Client;
        this.webSocketConnectionFactory = webSocketConnectionFactory;
        this.io = dataIO;
        this.sleeper = sleeper;

        prodMode = loadTestConfig.getWorkerUrlList().isEmpty();
        devWorkersList = loadTestConfig.getWorkerUrlList();
    }

    private String setAndInitializeNextWorker(String currentWorker, WorkerType workerType)
            throws NoWorkersAvailableException {
        return getNextWorker(currentWorker, workerType);
    }

    private void initializeInstance(String url) {
        browserEmulatorClient.ping(url);
        WebSocketClient ws = webSocketConnectionFactory
                .createConnection("ws://" + url + ":" + LoadTestService.WEBSOCKET_PORT + "/events");
        wsSessions.add(ws);
        browserEmulatorClient.initializeInstance(url);
    }

    private String getNextWorker(String actualCurrentWorkerUrl, WorkerType workerType)
            throws NoWorkersAvailableException {
        if (prodMode) {
            workersUsed++;
            String newWorkerUrl = "";
            List<Instance> actualWorkerList = null;
            List<Date> actualWorkerStartTimes = null;
            String workerTypeValue = workerType.getValue();
            if (workerType.equals(WorkerType.RECORDING_WORKER)) {
                actualWorkerList = recordingWorkersList;
                actualWorkerStartTimes = recordingWorkerStartTimes;
            } else {
                actualWorkerList = awsWorkersList;
                actualWorkerStartTimes = workerStartTimes;
            }
            if (actualCurrentWorkerUrl.isBlank()) {
                newWorkerUrl = actualWorkerList.get(0).publicDnsName();
                log.info("Getting new {} already launched: {}", workerTypeValue, newWorkerUrl);
            } else {
                int index = 0;
                Instance nextInstance;

                // Search last used instance
                for (int i = 0; i < actualWorkerList.size(); i++) {
                    if (actualCurrentWorkerUrl.equals(actualWorkerList.get(i).publicDnsName())) {
                        index = i;
                        break;
                    }
                }
                nextInstance = index + 1 >= actualWorkerList.size() ? null : actualWorkerList.get(index + 1);
                // TODO: Cover manual participants allocation with ramp up 0
                if (nextInstance == null) {
                    if (loadTestConfig.getWorkersRumpUp() == 0) {
                        log.error("No more workers available. Exiting");
                        throw new NoWorkersAvailableException("No more workers available. Exiting");
                    }
                    log.info("Launching a new Ec2 instance... ");
                    List<Instance> nextInstanceList = ec2Client
                            .launchInstance(loadTestConfig.getWorkersRumpUp(), workerType);
                    List<Future<?>> futures = new ArrayList<>();
                    ExecutorService executorService = Executors
                            .newFixedThreadPool(nextInstanceList.size());
                    nextInstanceList.forEach(instance -> {
                        futures.add(executorService.submit(new Runnable() {
                            @Override
                            public void run() {
                                initializeInstance(instance.publicDnsName());
                            }
                        }));
                    });
                    actualWorkerList.addAll(nextInstanceList);
                    actualWorkerStartTimes
                            .addAll(nextInstanceList.stream().map(i -> new Date()).collect(Collectors.toList()));
                    newWorkerUrl = nextInstanceList.get(0).publicDnsName();
                    futures.forEach(future -> {
                        try {
                            future.get();
                        } catch (InterruptedException | ExecutionException e) {
                            log.error("Error while initializing instance", e);
                        }
                    });
                    log.info("New {} has been launched: {}", workerTypeValue, newWorkerUrl);

                } else {
                    newWorkerUrl = nextInstance.publicDnsName();
                    log.info("Getting new {} already launched: {}", workerTypeValue, newWorkerUrl);
                }
            }
            return newWorkerUrl;
        } else {
            workersUsed = devWorkersList.size();
            int index = devWorkersList.indexOf(actualCurrentWorkerUrl);
            if (actualCurrentWorkerUrl.isBlank()) {
                return devWorkersList.get(0);
            } else {
                if (index + 1 >= devWorkersList.size()) {
                    log.error("No more workers available. Exiting");
                    throw new NoWorkersAvailableException("No more workers available. Exiting");
                }
            }
            return devWorkersList.get(index + 1);
        }
    }

    private class ParticipantTask implements Supplier<CreateParticipantResponse> {
        private String worker;
        private int user;
        private int session;
        private TestCase testCase;
        private boolean recording;
        private String recordingMetadata;
        private Role role;

        public ParticipantTask(String worker, int user, int session, TestCase testCase, Role role,
                boolean recording, String recordingMetadata) {
            this.worker = worker;
            this.session = session;
            this.user = user;
            this.testCase = testCase;
            this.role = role;
            this.recording = recording;
            this.recordingMetadata = recordingMetadata;
        }

        @Override
        public CreateParticipantResponse get() {
            CreateParticipantResponse response;
            if (recording) {
                if (role.equals(Role.PUBLISHER)) {
                    response = browserEmulatorClient.createExternalRecordingPublisher(worker, user, session, testCase,
                            recordingMetadata);
                } else {
                    response = browserEmulatorClient.createExternalRecordingSubscriber(worker, user, session, testCase,
                            recordingMetadata);
                }
            } else {
                if (role.equals(Role.PUBLISHER)) {
                    response = browserEmulatorClient.createPublisher(worker, user, session, testCase);
                } else {
                    response = browserEmulatorClient.createSubscriber(worker, user, session, testCase);
                }
            }
            if (response.isResponseOk()) {
                Calendar startTime = Calendar.getInstance();
                totalParticipants.incrementAndGet();
                List<String> sessionUserList = new ArrayList<>(2);
                sessionUserList.add(response.getSessionId());
                sessionUserList.add(response.getUserId());
                userStartTimes.put(startTime, sessionUserList);
            } else {
                log.error("Response status is not 200 OK. Exit");
            }
            return response;
        }

    }

    private boolean estimate(boolean instancesInitialized, String workerUrl, TestCase testCase, int publishers,
            int subscribers) {
        log.info("Starting browser estimation of CPU usage");
        if (!instancesInitialized) {
            initializeInstance(workerUrl);
        }
        boolean overloaded = false;
        int iteration = 0;
        while (!overloaded) {
            // TODO: take into account recording workers
            for (int i = 0; i < publishers; i++) {
                CreateParticipantResponse response = browserEmulatorClient.createPublisher(workerUrl, iteration + i, 0,
                        testCase);
                if (response.isResponseOk()) {
                    double cpu = response.getWorkerCpuPct();
                    if (cpu > loadTestConfig.getWorkerMaxLoad()) {
                        overloaded = true;
                        browserEstimation = iteration * (publishers + subscribers) + i + 1;
                        log.info("Browser estimation: {} browsers per worker.", browserEstimation);
                        break;
                    }
                } else {
                    log.error("Response status is not 200 OK. Exiting");
                    return false;
                }
                sleeper.sleep(5, "sleep between participants in estimation");
            }
            if (!overloaded) {
                for (int i = 0; i < subscribers; i++) {
                    CreateParticipantResponse response = browserEmulatorClient.createSubscriber(
                            workerUrl,
                            iteration + publishers + i, 0,
                            testCase);
                    if (response.isResponseOk()) {
                        double cpu = response.getWorkerCpuPct();
                        if (cpu >= loadTestConfig.getWorkerMaxLoad()) {
                            overloaded = true;
                            browserEstimation = iteration * (publishers + subscribers) + publishers + i + 1;
                            log.info("Browser estimation: {} browsers per worker.", browserEstimation);
                            break;
                        }
                    } else {
                        log.error("Response status is not 200 OK. Exiting");
                        return false;
                    }
                    sleeper.sleep(5, "sleep between participants in estimation");
                }
            }
            iteration++;
        }
        browserEmulatorClient.disconnectAll(List.of(workerUrl));
        return true;
    }

    private boolean launchInitialInstances() {
        boolean instancesInitialized = false;
        if (prodMode) {
            // Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
            awsWorkersList.addAll(ec2Client.launchAndCleanInitialInstances());
            recordingWorkersList.addAll(ec2Client.launchAndCleanInitialRecordingInstances());
            int tasks = Math.max(awsWorkersList.size(), recordingWorkersList.size());
            if (tasks > 0) {
                ExecutorService executorService = Executors
                        .newFixedThreadPool(tasks);
                List<Future<?>> futures = new ArrayList<>();
                awsWorkersList.forEach(instance -> {
                    futures.add(executorService.submit(new Runnable() {
                        @Override
                        public void run() {
                            initializeInstance(instance.publicDnsName());
                        }
                    }));
                });
                recordingWorkersList.forEach(instance -> {
                    futures.add(executorService.submit(new Runnable() {
                        @Override
                        public void run() {
                            initializeInstance(instance.publicDnsName());
                        }
                    }));
                });
                workerStartTimes.addAll(awsWorkersList.stream().map(inst -> new Date())
                        .collect(Collectors.toList()));
                recordingWorkerStartTimes.addAll(awsWorkersList.stream().map(inst -> new Date())
                        .collect(Collectors.toList()));
                futures.forEach(future -> {
                    try {
                        future.get();
                    } catch (InterruptedException | ExecutionException e) {
                        log.error("Error while initializing instance", e);
                    }
                });
            }

            instancesInitialized = true;
            // sleep(1, "Wait for instances to be cold");
        } else {
            List<Future<?>> futures = new ArrayList<>();
            ExecutorService executorService = Executors.newFixedThreadPool(devWorkersList.size());
            for (String workerUrl : devWorkersList) {
                futures.add(executorService.submit(() -> initializeInstance(workerUrl)));
            }
            for (Future<?> future : futures) {
                try {
                    future.get();
                } catch (InterruptedException | ExecutionException e) {
                    log.error("Error while initializing instance", e);
                }
            }
            instancesInitialized = true;
        }
        return instancesInitialized;
    }

    private boolean checkEnoughWorkers(int sessions, int participants) {
        int workersAvailable = prodMode ? loadTestConfig.getWorkersNumberAtTheBeginning() : devWorkersList.size();
        int workersRumpUp = prodMode ? loadTestConfig.getWorkersRumpUp() : 0;
        int nParticipants = sessions * participants;
        int estimatedParticipants = browserEstimation * workersAvailable;
        if (workersRumpUp < 1 && (sessions == -1 || (nParticipants > estimatedParticipants))) {

            String warning = "Number of available workers might not be enough to host all users ("
                    + (nParticipants < 0 ? "infinite" : nParticipants)
                    + " participants trying to fit in " + workersAvailable + " worker at " + browserEstimation
                    + " browsers per worker). The test will stop when there are no more workers available. Continue? (Y/N)";
            return io.askForConfirmation(warning);
        }

        return true;
    }

    public void startLoadTests(List<TestCase> testCasesList) {

        if (loadTestConfig.isTerminateWorkers()) {
            log.info("Terminate all EC2 instances");
            ec2Client.terminateAllInstances();
            return;
        }

        if (prodMode) {
            kibanaClient.importDashboards();
        }

        int workersAvailable = prodMode ? loadTestConfig.getWorkersNumberAtTheBeginning() : devWorkersList.size();
        int workersRumpUp = loadTestConfig.getWorkersRumpUp();

        if (workersAvailable == 0 && !(prodMode && workersRumpUp > 0)) {
            log.error("No workers available. Exiting");
            return;
        }

        testCasesList.forEach(testCase -> {

            if (testCase.isNxN()) {
                for (int i = 0; i < testCase.getParticipants().size(); i++) {
                    int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
                    boolean instancesInitialized = launchInitialInstances();
                    boolean noEstimateError = true;
                    if (loadTestConfig.isManualParticipantsAllocation()) {
                        browserEstimation = loadTestConfig.getUsersPerWorker();
                    } else {
                        noEstimateError = estimate(instancesInitialized,
                                prodMode ? awsWorkersList.get(0).publicDnsName() : devWorkersList.get(0),
                                testCase, participantsBySession, 0);
                    }
                    if (noEstimateError) {
                        boolean continueTest = checkEnoughWorkers(testCase.getSessions(), participantsBySession);
                        if (!continueTest) {
                            log.warn("Test case skipped.");
                            continue;
                        }
                        log.info("Starting test with N:N session topology");
                        log.info("The number of session that will be created are {}",
                                testCase.getSessions() < 0 ? "infinite" : testCase.getSessions());
                        log.info("Each session will be composed by {} USERS. All of them will be PUBLISHERS",
                                participantsBySession);
                        this.startTime = Calendar.getInstance();
                        CreateParticipantResponse lastCPR;
                        try {
                            lastCPR = this.startNxNTest(participantsBySession, testCase);
                        } catch (NoWorkersAvailableException e) {
                            lastCPR = new CreateParticipantResponse().setStopReason("No more workers available");
                        } catch (Exception e) {
                            lastCPR = new CreateParticipantResponse()
                                    .setStopReason("An unexpected error occurred: " + e.getMessage());
                            log.error("An unexpected error occurred", e);
                        }
                        browserEmulatorClient.setEndOfTest(true);
                        sleeper.sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
                        this.saveResultReport(testCase, String.valueOf(participantsBySession), lastCPR);
                    } else {
                        log.error("Error while estimating number of users per browser. Test case skipped.");
                    }
                    this.disconnectAllSessions();
                    this.cleanEnvironment();
                }
            } else if (testCase.isNxM() || testCase.isTeaching()) {
                for (int i = 0; i < testCase.getParticipants().size(); i++) {
                    String participants = testCase.getParticipants().get(i);
                    int publishers = Integer.parseInt(participants.split(":")[0]);
                    int subscribers = Integer.parseInt(participants.split(":")[1]);
                    boolean instancesInitialized = launchInitialInstances();
                    boolean noEstimateError = true;
                    if (loadTestConfig.isManualParticipantsAllocation()) {
                        browserEstimation = loadTestConfig.getUsersPerWorker();
                    } else {
                        noEstimateError = estimate(instancesInitialized,
                                prodMode ? awsWorkersList.get(0).publicDnsName() : devWorkersList.get(0),
                                testCase, publishers, subscribers);
                    }
                    if (noEstimateError) {
                        boolean continueTest = checkEnoughWorkers(testCase.getSessions(), publishers + subscribers);
                        if (!continueTest) {
                            log.warn("Test case skipped.");
                            continue;
                        }
                        log.info("Starting test with N:M session topology");
                        log.info("The number of session that will be created are {}", testCase.getSessions());
                        log.info("Each session will be composed by {} users. {} Publisher and {} Subscribers",
                                publishers + subscribers, publishers, subscribers);

                        this.startTime = Calendar.getInstance();
                        CreateParticipantResponse lastCPR;
                        try {
                            lastCPR = this.startNxMTest(publishers, subscribers, testCase);
                        } catch (NoWorkersAvailableException e) {
                            lastCPR = new CreateParticipantResponse().setStopReason("No more workers available");
                        } catch (Exception e) {
                            lastCPR = new CreateParticipantResponse()
                                    .setStopReason("An unexpected error occurred: " + e.getMessage());
                            log.error("An unexpected error occurred", e);
                        }
                        browserEmulatorClient.setEndOfTest(true);
                        sleeper.sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
                        this.saveResultReport(testCase, participants, lastCPR);
                    } else {
                        log.error("Error while estimating number of users per browser. Test case skipped.");
                    }
                    this.disconnectAllSessions();
                    this.cleanEnvironment();
                }

            } else if (testCase.isOneSession()) {
                for (int i = 0; i < testCase.getParticipants().size(); i++) {
                    boolean instancesInitialized = launchInitialInstances();
                    String participants = testCase.getParticipants().get(i);
                    if (participants.contains(":")) {
                        int publishers = Integer.parseInt(participants.split(":")[0]);
                        boolean noEstimateError = true;
                        if (loadTestConfig.isManualParticipantsAllocation()) {
                            browserEstimation = loadTestConfig.getUsersPerWorker();
                        } else {
                            noEstimateError = estimate(instancesInitialized,
                                    prodMode ? awsWorkersList.get(0).publicDnsName() : devWorkersList.get(0),
                                    testCase, publishers, Integer.MAX_VALUE);
                        }
                        if (noEstimateError) {
                            boolean continueTest = checkEnoughWorkers(-1, -1);
                            if (!continueTest) {
                                log.warn("Test case skipped.");
                                continue;
                            }
                            log.info("Starting test with one session {}:N topology", publishers);
                            log.info(
                                    "{} Publisher will be added to one session, and then it will be filled with Subscribers",
                                    publishers);

                            this.startTime = Calendar.getInstance();
                            CreateParticipantResponse lastCPR;
                            try {
                                lastCPR = this.startOneSessionXxNTest(publishers, testCase);
                            } catch (NoWorkersAvailableException e) {
                                lastCPR = new CreateParticipantResponse().setStopReason("No more workers available");
                            } catch (Exception e) {
                                lastCPR = new CreateParticipantResponse()
                                        .setStopReason("An unexpected error occurred: " + e.getMessage());
                                log.error("An unexpected error occurred", e);
                            }
                            browserEmulatorClient.setEndOfTest(true);
                            sleeper.sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(),
                                    "time before test finished");
                            this.saveResultReport(testCase, participants, lastCPR);
                        } else {
                            log.error("Error while estimating number of users per browser. Test case skipped.");
                        }
                    } else {
                        boolean noEstimateError = true;
                        if (!prodMode) {
                            browserEstimation = 1;
                        } else if (loadTestConfig.isManualParticipantsAllocation()) {
                            browserEstimation = loadTestConfig.getUsersPerWorker();
                        } else {
                            noEstimateError = estimate(instancesInitialized,
                                    prodMode ? awsWorkersList.get(0).publicDnsName() : devWorkersList.get(0),
                                    testCase, Integer.MAX_VALUE, 0);
                        }
                        if (noEstimateError) {
                            log.info("Starting test with one session N:N topology");
                            log.info("One session will be filled with Pubscribers");

                            this.startTime = Calendar.getInstance();
                            CreateParticipantResponse lastCPR;
                            try {
                                lastCPR = this.startOneSessionNxNTest(testCase);
                            } catch (NoWorkersAvailableException e) {
                                lastCPR = new CreateParticipantResponse().setStopReason("No more workers available");
                            } catch (Exception e) {
                                lastCPR = new CreateParticipantResponse()
                                        .setStopReason("An unexpected error occurred: " + e.getMessage());
                                log.error("An unexpected error occurred", e);
                            }
                            browserEmulatorClient.setEndOfTest(true);
                            sleeper.sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(),
                                    "time before test finished");
                            this.saveResultReport(testCase, participants, lastCPR);
                        }
                    }
                    this.disconnectAllSessions();
                    this.cleanEnvironment();
                }
            } else if (testCase.isTerminate() && prodMode) {
                log.info("TERMINATE topology. Terminate all EC2 instances");
                ec2Client.terminateAllInstances();
            } else {
                log.error("Test case has wrong topology, SKIPPED.");
            }
        });
    }

    public CreateParticipantResponse startOneSessionNxNTest(TestCase testCase) throws NoWorkersAvailableException {
        String worker = setAndInitializeNextWorker("", WorkerType.WORKER);
        String recWorker = "";

        boolean batches = loadTestConfig.isBatches();

        int startingParticipants = testCase.getStartingParticipants();
        int batchMax = loadTestConfig.getBatchMaxRequests();

        int maxRequestsInFlight = batches ? Math.max(startingParticipants, batchMax)
                : Math.max(startingParticipants, 1);
        ExecutorService executorService = Executors.newFixedThreadPool(maxRequestsInFlight);
        int browsersInWorker = 0;
        int tasksInProgress = 0;
        int participantCounter = 0;

        boolean waitCompletion = loadTestConfig.isWaitCompletion();

        AtomicReference<CreateParticipantResponse> lastResponse = new AtomicReference<>(null);
        AtomicBoolean stop = new AtomicBoolean(false);
        List<CompletableFuture<CreateParticipantResponse>> futureList = new ArrayList<>(maxRequestsInFlight);
        sessionNumber.set(1);
        log.info("Starting session '1'");
        while (true) {
            if (browsersInWorker >= browserEstimation) {
                log.info("Browsers in worker: {} is equal than limit: {}",
                        browsersInWorker, browserEstimation);
                worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
                browsersInWorker = 0;
            }
            log.info("Creating PUBLISHER '{}' in session {}",
                    loadTestConfig.getUserNamePrefix() + userNumber.get(),
                    loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
            CompletableFuture<CreateParticipantResponse> future;
            if (needRecordingParticipant()) {
                recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
                String recordingMetadata = "N-N_ONE";
                future = CompletableFuture.supplyAsync(
                        new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(), testCase,
                                Role.PUBLISHER, true, recordingMetadata),
                        executorService);
            } else {
                future = CompletableFuture.supplyAsync(
                        new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
                                testCase, Role.PUBLISHER, false, null),
                        executorService);
                browsersInWorker++;
            }
            tasksInProgress++;
            participantCounter++;
            boolean dontWait = !waitCompletion;
            boolean hasStartingParticipants = startingParticipants > 0;
            boolean isStartingParticipant = hasStartingParticipants && (participantCounter <= startingParticipants);
            boolean isLastStartingParticipant = hasStartingParticipants && (participantCounter == startingParticipants);
            if (hasStartingParticipants) {
                dontWait = dontWait && isStartingParticipant;
            }
            if (dontWait) {
                future.thenAccept((CreateParticipantResponse response) -> {
                    if (!response.isResponseOk()) {
                        lastResponse.set(response);
                        stop.set(true);
                    }
                });
            }
            futureList.add(future);
            boolean waitWithoutBatches = !batches && waitCompletion;
            boolean batchMaxCount = tasksInProgress >= batchMax;
            boolean waitForBatch = !isStartingParticipant && waitCompletion && batchMaxCount;
            boolean waitForResponses = waitWithoutBatches || isLastStartingParticipant || waitForBatch;
            if (waitForResponses) {
                lastResponse.set(getLastResponse(futureList));
                CreateParticipantResponse lastResponseValue = lastResponse.get();
                // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                if ((lastResponseValue != null) && (!lastResponseValue.isResponseOk())) {
                    return lastResponseValue;
                }
                futureList = new ArrayList<>(maxRequestsInFlight);
                tasksInProgress = 0;
                sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
                waitReconnectingUsers();
            } else if (!waitCompletion && stop.get()) {
                return lastResponse.get();
            }
        }
    }

    public CreateParticipantResponse startOneSessionXxNTest(int publishers, TestCase testCase)
            throws NoWorkersAvailableException {
        String worker = setAndInitializeNextWorker("", WorkerType.WORKER);
        String recWorker = "";

        boolean batches = loadTestConfig.isBatches();

        int startingParticipants = testCase.getStartingParticipants();
        int batchMax = loadTestConfig.getBatchMaxRequests();

        int maxRequestsInFlight = batches ? Math.max(startingParticipants, batchMax)
                : Math.max(startingParticipants, 1);
        ExecutorService executorService = Executors.newFixedThreadPool(maxRequestsInFlight);
        int browsersInWorker = 0;
        int tasksInProgress = 0;
        int participantCounter = 0;

        boolean waitCompletion = loadTestConfig.isWaitCompletion();

        AtomicReference<CreateParticipantResponse> lastResponse = new AtomicReference<>(null);
        AtomicBoolean stop = new AtomicBoolean(false);
        List<CompletableFuture<CreateParticipantResponse>> futureList = new ArrayList<>(maxRequestsInFlight);
        sessionNumber.set(1);
        log.info("Starting session '1'");
        for (int i = 0; i < publishers; i++) {
            if (browsersInWorker >= browserEstimation) {
                log.info("Browsers in worker: {} is equal than limit: {}",
                        browsersInWorker, browserEstimation);
                worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
                browsersInWorker = 0;
            }
            log.info("Creating PUBLISHER '{}' in session {}",
                    loadTestConfig.getUserNamePrefix() + userNumber.get(),
                    loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
            CompletableFuture<CreateParticipantResponse> future;
            if (needRecordingParticipant()) {
                recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
                String recordingMetadata = "X-M_" + publishers + "_ONE";
                future = CompletableFuture.supplyAsync(
                        new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(), testCase,
                                Role.PUBLISHER, true, recordingMetadata),
                        executorService);
            } else {
                future = CompletableFuture.supplyAsync(
                        new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
                                testCase, Role.PUBLISHER, false, null),
                        executorService);
                browsersInWorker++;
            }
            tasksInProgress++;
            participantCounter++;
            boolean dontWait = !waitCompletion;
            boolean hasStartingParticipants = startingParticipants > 0;
            boolean isStartingParticipant = hasStartingParticipants && (participantCounter <= startingParticipants);
            boolean isLastStartingParticipant = hasStartingParticipants && (participantCounter == startingParticipants);
            if (hasStartingParticipants) {
                dontWait = dontWait && isStartingParticipant;
            }
            if (dontWait) {
                future.thenAccept((CreateParticipantResponse response) -> {
                    if (!response.isResponseOk()) {
                        lastResponse.set(response);
                        stop.set(true);
                    }
                });
            }
            futureList.add(future);
            boolean waitWithoutBatches = !batches && waitCompletion;
            boolean batchMaxCount = tasksInProgress >= batchMax;
            boolean waitForBatch = !isStartingParticipant && waitCompletion && batchMaxCount;
            boolean waitForResponses = waitWithoutBatches || isLastStartingParticipant || waitForBatch;
            if (waitForResponses) {
                lastResponse.set(getLastResponse(futureList));
                CreateParticipantResponse lastResponseValue = lastResponse.get();
                // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                if ((lastResponseValue != null) && (!lastResponseValue.isResponseOk())) {
                    return lastResponseValue;
                }
                futureList = new ArrayList<>(maxRequestsInFlight);
                tasksInProgress = 0;
                sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
                waitReconnectingUsers();
            } else if (!waitCompletion && stop.get()) {
                return lastResponse.get();
            }
        }
        while (true) {
            if (browsersInWorker >= browserEstimation) {
                log.info("Browsers in worker: {} is equal than limit: {}",
                        browsersInWorker, browserEstimation);
                worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
                browsersInWorker = 0;
            }
            log.info("Creating SUBSCRIBER '{}' in session {}",
                    loadTestConfig.getUserNamePrefix() + userNumber.get(),
                    loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
            CompletableFuture<CreateParticipantResponse> future;
            if (needRecordingParticipant()) {
                recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
                String recordingMetadata = "X-M_" + publishers + "_ONE";
                future = CompletableFuture.supplyAsync(
                        new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(),
                                testCase, Role.SUBSCRIBER, true, recordingMetadata),
                        executorService);
            } else {
                future = CompletableFuture.supplyAsync(
                        new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
                                testCase, Role.SUBSCRIBER, false, null),
                        executorService);
                browsersInWorker++;
            }
            futureList.add(future);
            tasksInProgress++;
            participantCounter++;
            boolean dontWait = !waitCompletion;
            boolean hasStartingParticipants = startingParticipants > 0;
            boolean isStartingParticipant = hasStartingParticipants && (participantCounter <= startingParticipants);
            boolean isLastStartingParticipant = hasStartingParticipants && (participantCounter == startingParticipants);
            if (hasStartingParticipants) {
                dontWait = dontWait && isStartingParticipant;
            }
            if (dontWait) {
                future.thenAccept((CreateParticipantResponse response) -> {
                    if (!response.isResponseOk()) {
                        lastResponse.set(response);
                        stop.set(true);
                    }
                });
            }
            boolean waitWithoutBatches = !batches && waitCompletion;
            boolean batchMaxCount = tasksInProgress >= batchMax;
            boolean waitForBatch = !isStartingParticipant && waitCompletion && batchMaxCount;
            boolean waitForResponses = waitWithoutBatches || isLastStartingParticipant || waitForBatch;
            if (waitForResponses) {
                lastResponse.set(getLastResponse(futureList));
                CreateParticipantResponse lastResponseValue = lastResponse.get();
                // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                if ((lastResponseValue != null) && (!lastResponseValue.isResponseOk())) {
                    return lastResponseValue;
                }
                futureList = new ArrayList<>(maxRequestsInFlight);
                tasksInProgress = 0;
                sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
                waitReconnectingUsers();
            } else if (!waitCompletion && stop.get()) {
                return lastResponse.get();
            }
        }
    }

    public CreateParticipantResponse startNxNTest(int participantsBySession, TestCase testCase)
            throws NoWorkersAvailableException {
        int testCaseSessionsLimit = testCase.getSessions();

        String worker = setAndInitializeNextWorker("", WorkerType.WORKER);
        String recWorker = "";

        boolean batches = loadTestConfig.isBatches();

        int startingParticipants = testCase.getStartingParticipants();
        int batchMax = loadTestConfig.getBatchMaxRequests();

        int maxRequestsInFlight = batches ? Math.max(startingParticipants, batchMax)
                : Math.max(startingParticipants, 1);
        ExecutorService executorService = Executors.newFixedThreadPool(maxRequestsInFlight);
        int browsersInWorker = 0;
        int tasksInProgress = 0;
        int participantCounter = 0;

        boolean waitCompletion = loadTestConfig.isWaitCompletion();

        AtomicReference<CreateParticipantResponse> lastResponse = new AtomicReference<>(null);
        AtomicBoolean stop = new AtomicBoolean(false);
        List<CompletableFuture<CreateParticipantResponse>> futureList = new ArrayList<>(maxRequestsInFlight);
        while (needCreateNewSession(testCaseSessionsLimit)) {

            if (sessionNumber.get() > 0) {
                sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
            }

            sessionNumber.getAndIncrement();
            log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.toString());
            boolean isLastSession = sessionNumber.get() == testCaseSessionsLimit;
            for (int i = 0; i < participantsBySession; i++) {
                if (browsersInWorker >= browserEstimation) {
                    log.info("Browsers in worker: {} is equal than limit: {}",
                            browsersInWorker, browserEstimation);
                    worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
                    browsersInWorker = 0;
                }
                log.info("Creating PUBLISHER '{}' in session {}",
                        loadTestConfig.getUserNamePrefix() + userNumber.get(),
                        loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
                CompletableFuture<CreateParticipantResponse> future;
                if (needRecordingParticipant()) {
                    recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
                    String recordingMetadata = "N-N_" + participantsBySession
                            + "_"
                            + participantsBySession + "PSes";
                    future = CompletableFuture.supplyAsync(
                            new ParticipantTask(recWorker, browsersInWorker, testCaseSessionsLimit, testCase, null,
                                    isLastSession, recordingMetadata),
                            executorService);
                } else {
                    future = CompletableFuture.supplyAsync(
                            new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(), testCase,
                                    Role.PUBLISHER, false, null),
                            executorService);
                    browsersInWorker++;
                }
                tasksInProgress++;
                participantCounter++;

                boolean dontWait = !waitCompletion;
                boolean hasStartingParticipants = startingParticipants > 0;
                boolean isStartingParticipant = hasStartingParticipants && (participantCounter <= startingParticipants);
                boolean isLastStartingParticipant = hasStartingParticipants
                        && (participantCounter == startingParticipants);
                if (hasStartingParticipants) {
                    dontWait = dontWait && isStartingParticipant;
                }
                if (dontWait) {
                    future.thenAccept((CreateParticipantResponse response) -> {
                        if (!response.isResponseOk()) {
                            lastResponse.set(response);
                            stop.set(true);
                        }
                    });
                }
                futureList.add(future);
                boolean isLastParticipant = i == participantsBySession - 1;
                if (!(isLastParticipant && isLastSession)) {
                    boolean waitWithoutBatches = !batches && waitCompletion;
                    boolean batchMaxCount = tasksInProgress >= batchMax;
                    boolean waitForBatch = !isStartingParticipant && waitCompletion && batchMaxCount;
                    boolean waitForResponses = waitWithoutBatches || isLastStartingParticipant || waitForBatch;
                    if (waitForResponses) {
                        lastResponse.set(getLastResponse(futureList));
                        CreateParticipantResponse lastResponseValue = lastResponse.get();
                        // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                        if ((lastResponseValue != null) && (!lastResponseValue.isResponseOk())) {
                            return lastResponseValue;
                        }
                        futureList = new ArrayList<>(maxRequestsInFlight);
                        tasksInProgress = 0;
                        sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(),
                                "time between participants");
                        waitReconnectingUsers();
                    } else if (!waitCompletion && stop.get()) {
                        return lastResponse.get();
                    }
                } else {
                    lastResponse.set(getLastResponse(futureList));
                    CreateParticipantResponse lastResponseValue = lastResponse.get();
                    // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                    if ((lastResponseValue != null) && !lastResponseValue.isResponseOk()) {
                        return lastResponseValue;
                    }
                    futureList = new ArrayList<>(maxRequestsInFlight);
                }
            }

            log.info("Session number {} has been succesfully created ", sessionNumber.get());
            sessionsCompleted.incrementAndGet();
            userNumber.set(1);
        }
        return lastResponse.get();
    }

    private void waitReconnectingUsers() {
        boolean isAnyReconnecting = browserEmulatorClient.isAnyParticipantReconnecting();
        boolean isNotReconnectingError = browserEmulatorClient.getLastErrorReconnectingResponse() == null;
        while (isAnyReconnecting && isNotReconnectingError) {
            sleeper.sleep(5, "waiting for reconnecting users");
            isAnyReconnecting = browserEmulatorClient.isAnyParticipantReconnecting();
            isNotReconnectingError = browserEmulatorClient.getLastErrorReconnectingResponse() == null;
        }
    }

    public CreateParticipantResponse startNxMTest(int publishers, int subscribers, TestCase testCase)
            throws NoWorkersAvailableException {
        int testCaseSessionsLimit = testCase.getSessions();

        String worker = setAndInitializeNextWorker("", WorkerType.WORKER);
        String recWorker = "";

        boolean batches = loadTestConfig.isBatches();

        int startingParticipants = testCase.getStartingParticipants();
        int batchMax = loadTestConfig.getBatchMaxRequests();

        int maxRequestsInFlight = batches ? Math.max(startingParticipants, batchMax)
                : Math.max(startingParticipants, 1);
        ExecutorService executorService = Executors.newFixedThreadPool(maxRequestsInFlight);
        int browsersInWorker = 0;
        int tasksInProgress = 0;
        int participantCounter = 0;

        boolean waitCompletion = loadTestConfig.isWaitCompletion();

        AtomicReference<CreateParticipantResponse> lastResponse = new AtomicReference<>(null);
        AtomicBoolean stop = new AtomicBoolean(false);
        List<CompletableFuture<CreateParticipantResponse>> futureList = new ArrayList<>(browserEstimation);
        while (needCreateNewSession(testCaseSessionsLimit)) {

            if (sessionNumber.get() > 0) {
                // Waiting time between sessions
                sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
            }

            sessionNumber.getAndIncrement();
            log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.toString());
            boolean isLastSession = sessionNumber.get() == testCaseSessionsLimit;
            // Adding all publishers
            for (int i = 0; i < publishers; i++) {
                if (browsersInWorker >= browserEstimation) {
                    log.info("Browsers in worker: {} is equal than limit: {}",
                            browsersInWorker, browserEstimation);
                    worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
                    browsersInWorker = 0;
                }
                log.info("Creating PUBLISHER '{}' in session {}",
                        loadTestConfig.getUserNamePrefix() + userNumber.get(),
                        loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
                CompletableFuture<CreateParticipantResponse> future;
                if (needRecordingParticipant()) {
                    recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
                    String recordingMetadata = "N-M_" + publishers + "_"
                            + subscribers + "PSes";
                    future = CompletableFuture.supplyAsync(
                            new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(), testCase,
                                    Role.PUBLISHER, true, recordingMetadata),
                            executorService);
                } else {
                    future = CompletableFuture.supplyAsync(
                            new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
                                    testCase, Role.PUBLISHER, false, null),
                            executorService);
                    browsersInWorker++;
                }
                tasksInProgress++;
                participantCounter++;
                boolean dontWait = !waitCompletion;
                boolean hasStartingParticipants = startingParticipants > 0;
                boolean isStartingParticipant = hasStartingParticipants && (participantCounter <= startingParticipants);
                boolean isLastStartingParticipant = hasStartingParticipants
                        && (participantCounter == startingParticipants);
                if (hasStartingParticipants) {
                    dontWait = dontWait && isStartingParticipant;
                }
                if (dontWait) {
                    future.thenAccept((CreateParticipantResponse response) -> {
                        if (!response.isResponseOk()) {
                            lastResponse.set(response);
                            stop.set(true);
                        }
                    });
                }
                futureList.add(future);
                boolean waitWithoutBatches = !batches && waitCompletion;
                boolean batchMaxCount = tasksInProgress >= batchMax;
                boolean waitForBatch = !isStartingParticipant && waitCompletion && batchMaxCount;
                boolean waitForResponses = waitWithoutBatches || isLastStartingParticipant || waitForBatch;
                if (waitForResponses) {
                    lastResponse.set(getLastResponse(futureList));
                    CreateParticipantResponse lastResponseValue = lastResponse.get();
                    // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                    if ((lastResponseValue != null) && (!lastResponseValue.isResponseOk())) {
                        return lastResponseValue;
                    }
                    futureList = new ArrayList<>(maxRequestsInFlight);
                    tasksInProgress = 0;
                    sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
                    waitReconnectingUsers();
                } else if (!waitCompletion && stop.get()) {
                    return lastResponse.get();
                }
            }

            // Adding all subscribers
            for (int i = 0; i < subscribers; i++) {
                if (browsersInWorker >= browserEstimation) {
                    log.info("Browsers in worker: {} is equal than limit: {}",
                            browsersInWorker, browserEstimation);
                    worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
                    browsersInWorker = 0;
                }
                log.info("Creating SUBSCRIBER '{}' in session {}",
                        loadTestConfig.getUserNamePrefix() + userNumber.get(),
                        loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
                CompletableFuture<CreateParticipantResponse> future;
                if (needRecordingParticipant()) {
                    recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
                    String recordingMetadata = "N-M_" + publishers + "_"
                            + subscribers + "PSes";
                    future = CompletableFuture.supplyAsync(
                            new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(),
                                    testCase, Role.SUBSCRIBER, true, recordingMetadata),
                            executorService);
                } else {
                    future = CompletableFuture.supplyAsync(
                            new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
                                    testCase, Role.SUBSCRIBER, false, null),
                            executorService);
                    browsersInWorker++;
                }
                futureList.add(future);
                tasksInProgress++;
                participantCounter++;
                boolean dontWait = !waitCompletion;
                boolean hasStartingParticipants = startingParticipants > 0;
                boolean isStartingParticipant = hasStartingParticipants && (participantCounter <= startingParticipants);
                boolean isLastStartingParticipant = hasStartingParticipants
                        && (participantCounter == startingParticipants);
                if (hasStartingParticipants) {
                    dontWait = dontWait && isStartingParticipant;
                }
                if (dontWait) {
                    future.thenAccept((CreateParticipantResponse response) -> {
                        if (!response.isResponseOk()) {
                            lastResponse.set(response);
                            stop.set(true);
                        }
                    });
                }
                boolean isLastParticipant = i == subscribers - 1;
                if (!(isLastParticipant && isLastSession)) {
                    boolean waitWithoutBatches = !batches && waitCompletion;
                    boolean batchMaxCount = tasksInProgress >= batchMax;
                    boolean waitForBatch = !isStartingParticipant && waitCompletion && batchMaxCount;
                    boolean waitForResponses = waitWithoutBatches || isLastStartingParticipant || waitForBatch;
                    if (waitForResponses) {
                        lastResponse.set(getLastResponse(futureList));
                        CreateParticipantResponse lastResponseValue = lastResponse.get();
                        // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                        if ((lastResponseValue != null) && (!lastResponseValue.isResponseOk())) {
                            return lastResponseValue;
                        }
                        futureList = new ArrayList<>(maxRequestsInFlight);
                        tasksInProgress = 0;
                        sleeper.sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(),
                                "time between participants");
                        waitReconnectingUsers();
                    } else if (!waitCompletion && stop.get()) {
                        return lastResponse.get();
                    }
                } else {
                    lastResponse.set(getLastResponse(futureList));
                    CreateParticipantResponse lastResponseValue = lastResponse.get();
                    // streamsPerWorker.add(lastResponse.getStreamsInWorker());
                    if ((lastResponseValue != null) && !lastResponseValue.isResponseOk()) {
                        return lastResponseValue;
                    }
                    futureList = new ArrayList<>(maxRequestsInFlight);
                }
            }
            log.info("Session number {} has been succesfully created ", sessionNumber.get());
            sessionsCompleted.incrementAndGet();
            userNumber.set(1);
        }
        return lastResponse.get();
    }

    private CreateParticipantResponse checkReconnectingResponse() {
        return browserEmulatorClient.getLastErrorReconnectingResponse();
    }

    private CreateParticipantResponse getLastResponse(List<CompletableFuture<CreateParticipantResponse>> futureList) {
        CreateParticipantResponse reconnectingResponse = checkReconnectingResponse();
        if (reconnectingResponse != null) {
            return reconnectingResponse;
        }
        CreateParticipantResponse lastResponse = null;
        for (CompletableFuture<CreateParticipantResponse> future : futureList) {
            try {
                log.debug("Waiting for future ", future);
                CreateParticipantResponse futureResponse = future.get();
                if (!futureResponse.isResponseOk()) {
                    lastResponse = futureResponse;
                    break;
                }
                if ((lastResponse == null) || (futureResponse.getStreamsInWorker() >= lastResponse
                        .getStreamsInWorker())) {
                    lastResponse = futureResponse;
                }
            } catch (Exception e) {
                log.error("Error while waiting for future", e);
            }
        }
        return lastResponse;
    }

    private boolean needCreateNewSession(int sessionsLimit) {
        return sessionsLimit == -1 || (sessionsLimit > 0 && sessionsCompleted.get() < sessionsLimit);
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

    private void cleanEnvironment() {

        totalParticipants.set(0);
        sessionsCompleted.set(0);
        sessionNumber.set(0);
        userNumber.set(1);
        workersUsed = 0;
        // streamsPerWorker = new ArrayList<>();
        workerStartTimes = new ArrayList<>();
        recordingWorkerStartTimes = new ArrayList<>();
        workerTimes = new ArrayList<>();
        recordingWorkerTimes = new ArrayList<>();
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
        for (WebSocketClient ws : wsSessions) {
            if (ws != null) {
                ws.markForFullDeletion();
            }
        }
        for (WebSocketClient ws : wsSessions) {
            if (ws != null) {
                ws.close();
            }
        }
        wsSessions.clear();
        List<String> workersUrl = devWorkersList;
        if (prodMode) {
            // Add all ec2 instances
            for (Instance ec2 : awsWorkersList) {
                workersUrl.add(ec2.publicDnsName());
            }
            for (Instance recordingEc2 : recordingWorkersList) {
                workersUrl.add(recordingEc2.publicDnsName());
            }
            browserEmulatorClient.disconnectAll(workersUrl);

            // Calculate QoE
            if (loadTestConfig.isQoeAnalysisRecordings() && loadTestConfig.isQoeAnalysisInSitu()) {
                List<Instance> allWorkers = new ArrayList<>(awsWorkersList);
                allWorkers.addAll(recordingWorkersList);
                browserEmulatorClient.calculateQoe(allWorkers);
            }

            ec2Client.stopInstance(recordingWorkersList);
            ec2Client.stopInstance(awsWorkersList);

            awsWorkersList = new ArrayList<Instance>();
            recordingWorkersList = new ArrayList<Instance>();

        } else {
            browserEmulatorClient.disconnectAll(workersUrl);
            // Calculate QoE
            if (loadTestConfig.isQoeAnalysisRecordings() && loadTestConfig.isQoeAnalysisInSitu()) {
                List<Instance> allWorkers = new ArrayList<>(awsWorkersList);
                allWorkers.addAll(recordingWorkersList);
                browserEmulatorClient.calculateQoe(allWorkers);
            }
        }
        Date stopDate = new Date();
        workerTimes = workerStartTimes.stream()
                .map(workerStartTime -> TimeUnit.MINUTES.convert(stopDate.getTime() - workerStartTime.getTime(),
                        TimeUnit.MILLISECONDS))
                .collect(Collectors.toList());
        recordingWorkerTimes = recordingWorkerStartTimes.stream()
                .map(startTime -> TimeUnit.MINUTES.convert(stopDate.getTime() - startTime.getTime(),
                        TimeUnit.MILLISECONDS))
                .collect(Collectors.toList());
    }

    private void saveResultReport(TestCase testCase, String participantsBySession, CreateParticipantResponse lastCPR) {
        Calendar endTime = Calendar.getInstance();
        endTime.add(Calendar.SECOND, loadTestConfig.getSecondsToWaitBetweenTestCases());
        endTime.add(Calendar.SECOND, 10);

        // Parse date to match with Kibana time filter
        String startTimeStr = formatter.format(this.startTime.getTime()).replace(" ", "T");
        String endTimeStr = formatter.format(endTime.getTime()).replace(" ", "T");
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
        ResultReport rr = new ResultReport().setTotalParticipants(totalParticipants.get())
                .setNumSessionsCompleted(sessionsCompleted.get()).setNumSessionsCreated(sessionNumber.get())
                .setWorkersUsed(workersUsed)
                // .setStreamsPerWorker(streamsPerWorker)
                .setSessionTopology(testCase.getTopology().toString())
                .setOpenviduRecording(testCase.getOpenviduRecordingMode().toString())
                .setBrowserRecording(testCase.isBrowserRecording()).setParticipantsPerSession(participantsBySession)
                .setStopReason(stopReason).setStartTime(this.startTime)
                .setEndTime(endTime).setKibanaUrl(kibanaUrl)
                .setManualParticipantAllocation(loadTestConfig.isManualParticipantsAllocation())
                .setUsersPerWorker(loadTestConfig.getUsersPerWorker())
                .setS3BucketName(videoControl)
                .setTimePerWorker(workerTimes).setTimePerRecordingWorker(recordingWorkerTimes)
                .setUserStartTimes(userStartTimes)
                .build();

        io.exportResults(rr);

    }

}
