package io.openvidu.loadtest.unit.services;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import software.amazon.awssdk.services.ec2.model.Instance;

import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.Sleeper;
import io.openvidu.loadtest.services.WebSocketClient;
import io.openvidu.loadtest.services.WebSocketConnectionFactory;
import io.openvidu.loadtest.services.WorkerUrlResolver;
import io.openvidu.loadtest.services.core.LoadTestService;
import io.openvidu.loadtest.utils.DataIO;

class LoadTestServiceTests {

    @Mock
    private BrowserEmulatorClient browserEmulatorClient;

    @Mock
    private LKLoadTestConfig loadTestConfig;

    @Mock
    private KibanaClient kibanaClient;

    @Mock
    private ElasticSearchClient elasticSearchClient;

    @Mock
    private Ec2Client ec2Client;

    @Mock
    private WebSocketConnectionFactory webSocketConnectionFactory;

    @Mock
    private DataIO dataIO;

    @Mock
    private Sleeper sleeper;

    @Mock
    private WorkerUrlResolver workerUrlResolver;

    private LoadTestService loadTestController;

    @BeforeEach
    void init() {
        MockitoAnnotations.openMocks(this);
        when(this.loadTestConfig.getOpenViduUrl()).thenReturn("https://url.com");

        when(this.loadTestConfig.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfig.getSessionNamePrefix()).thenReturn("LoadTestSession");
        when(this.loadTestConfig.isTerminateWorkers()).thenReturn(false);
        when(this.loadTestConfig.isKibanaEstablished()).thenReturn(true);
        when(this.loadTestConfig.getReportOutput()).thenReturn(List.of("html", "txt"));
        when(this.webSocketConnectionFactory.createConnection(anyString())).thenReturn(mock(WebSocketClient.class));
        when(this.browserEmulatorClient.getRetryStatistics()).thenReturn(new int[] { 0, 0 });
        when(this.browserEmulatorClient.getMaxRetriesPerParticipant()).thenReturn(0);
        when(this.workerUrlResolver.resolveUrl(any(Instance.class))).thenAnswer(invocation -> {
            Instance instance = invocation.getArgument(0);
            return instance.publicDnsName();
        });
        when(this.workerUrlResolver.resolveUrls(anyList())).thenAnswer(invocation -> {
            List<Instance> instances = invocation.getArgument(0);
            return instances.stream().map(Instance::publicDnsName).toList();
        });
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(8);
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
    }

    private Instance generateRandomInstance() {
        Random random = new Random();
        String instanceId = "i-" + UUID.randomUUID().toString().replace("-", "").substring(0, 17).toLowerCase();
        String publicDnsName = "ec2-" + random.nextInt(255) + "-"
                + random.nextInt(255) + "-" + random.nextInt(255) + "-" + random.nextInt(255) +
                ".compute-1.amazonaws.com";

        return Instance.builder()
                .instanceId(instanceId)
                .publicDnsName(publicDnsName)
                .build();
    }

    @Test
    void NxNTest8ParticipantsStartingParticipantsThenBatches() throws Exception {
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        int workersAtStart = 40;
        when(this.loadTestConfig.getWorkersNumberAtTheBeginning()).thenReturn(workersAtStart);
        // Enable ramp-up so AWS workers are not considered limited in this test
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(5);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(0);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(0);
        when(this.loadTestConfig.isBatches()).thenReturn(true);
        when(this.loadTestConfig.isWaitCompletion()).thenReturn(true);
        when(this.loadTestConfig.getBatchMaxRequests()).thenReturn(10);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(1);

        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        // Create list of instances for ec2 client mock
        List<Instance> instances = new ArrayList<>(workersAtStart);
        for (int i = 0; i < workersAtStart; i++) {
            instances.add(generateRandomInstance());
        }

        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }

        List<String> participants = List.of("8");

        TestCase testCase = new TestCase("N:N", participants, -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);
        testCase.setStartingParticipants(30);
        List<TestCase> testCases = List.of(testCase);

        int userCounter = 1;
        int sessionCounter = 1;
        for (Instance instance : instances.subList(0, 39)) {
            createSuccessfulResponsesMock(instance.publicDnsName(), testCase, 1, userCounter, sessionCounter, 8, -1);
            if (userCounter < 8) {
                userCounter++;
            } else {
                userCounter = 1;
                sessionCounter++;
            }
        }
        // Failure when adding participant
        CreateParticipantResponse failureResponse = new CreateParticipantResponse(false, "Any reason", "connectionId3",
                -1, -1, "", "", 0, "");
        when(this.browserEmulatorClient.createPublisher(instances.get(39).publicDnsName(), 8, 5, testCase)).thenReturn(
                failureResponse);

        // Test start
        this.loadTestController.startLoadTests(testCases);

        List<String> instanceUrls = instances.stream().map(Instance::publicDnsName).toList();
        verify(this.kibanaClient, times(1)).importDashboards();
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instance.publicDnsName()), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        userCounter = 1;
        sessionCounter = 1;
        // Check all minimum used instances
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            // Last one may be called may not be called depending on number of cores
            verify(this.browserEmulatorClient, times(1)).createPublisher(instanceUrl, userCounter, sessionCounter,
                    testCase);
            if (userCounter < 8) {
                userCounter++;
            } else {
                userCounter = 1;
                sessionCounter++;
            }
        }
        verify(this.browserEmulatorClient, times(1)).disconnectAll(instanceUrls);
        verify(this.ec2Client, times(1)).stopInstance(instances);

        verify(this.sleeper, atLeast(1)).sleep(eq(5), anyString());

        // Check result report
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void NxMTest3Publishers10SubscribersStartingParticipantsThenBatches() throws Exception {
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        int workersAtStart = 40;
        when(this.loadTestConfig.getWorkersNumberAtTheBeginning()).thenReturn(workersAtStart);
        // Enable ramp-up so AWS workers are not considered limited in this test
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(5);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(0);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(0);
        when(this.loadTestConfig.isBatches()).thenReturn(true);
        when(this.loadTestConfig.isWaitCompletion()).thenReturn(true);
        when(this.loadTestConfig.getBatchMaxRequests()).thenReturn(5);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(1);

        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        // Create list of instances for ec2 client mock
        List<Instance> instances = new ArrayList<>(workersAtStart);
        for (int i = 0; i < workersAtStart; i++) {
            instances.add(generateRandomInstance());
        }

        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }

        List<String> participants = List.of("3:10");

        TestCase testCase = new TestCase("N:M", participants, -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);
        testCase.setStartingParticipants(30);
        List<TestCase> testCases = List.of(testCase);

        int userCounter = 1;
        int sessionCounter = 1;
        for (Instance instance : instances.subList(0, 39)) {
            createSuccessfulResponsesMock(instance.publicDnsName(), testCase, 1, userCounter, sessionCounter, 13, 3);
            if (userCounter < 13) {
                userCounter++;
            } else {
                userCounter = 1;
                sessionCounter++;
            }
        }
        // Failure when adding participant
        CreateParticipantResponse failureResponse = new CreateParticipantResponse(false, "Any reason", "connectionId3",
                -1, -1, "", "", 0, "");
        when(this.browserEmulatorClient.createPublisher(instances.get(39).publicDnsName(), 1, 4, testCase)).thenReturn(
                failureResponse);

        // Test start
        this.loadTestController.startLoadTests(testCases);

        List<String> instanceUrls = instances.stream().map(Instance::publicDnsName).toList();
        verify(this.kibanaClient, times(1)).importDashboards();
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instance.publicDnsName()), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        userCounter = 1;
        sessionCounter = 1;
        // Check all minimum used instances
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            // Last one may be called may not be called depending on number of cores
            if (userCounter <= 3) {
                verify(this.browserEmulatorClient, times(1)).createPublisher(instanceUrl, userCounter, sessionCounter,
                        testCase);
            } else {
                verify(this.browserEmulatorClient, times(1)).createSubscriber(instanceUrl, userCounter, sessionCounter,
                        testCase);
            }
            if (userCounter < 13) {
                userCounter++;
            } else {
                userCounter = 1;
                sessionCounter++;
            }
        }
        verify(this.browserEmulatorClient, times(1)).disconnectAll(instanceUrls);
        verify(this.ec2Client, times(1)).stopInstance(instances);

        verify(this.sleeper, atLeast(1)).sleep(eq(5), anyString());

        // Check result report
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void NxNTest8ParticipantsWithEstimationWithRampUpNoQOENoRecording() throws Exception {
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(5);
        when(this.loadTestConfig.isBatches()).thenReturn(true);
        when(this.loadTestConfig.isWaitCompletion()).thenReturn(true);
        when(this.loadTestConfig.getBatchMaxRequests()).thenReturn(17);

        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        // Create list of instances for ec2 client mock
        Instance instance1 = generateRandomInstance();
        Instance instance2 = generateRandomInstance();
        String instance1Url = instance1.publicDnsName();
        List<Instance> instances = List.of(instance1, instance2);

        List<Instance> rampUpInstances = new ArrayList<>();
        for (int i = 0; i < 80; i++) {
            rampUpInstances.add(generateRandomInstance());
        }

        List<Instance> allInstances = Stream.concat(instances.stream(), rampUpInstances.stream())
                .toList();

        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));
        when(this.ec2Client.launchInstance(1, WorkerType.WORKER)).thenReturn(rampUpInstances);

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (Instance instance : allInstances) {
            String instanceUrl = instance.publicDnsName();
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }

        List<String> participants = List.of("8");

        TestCase testCase = new TestCase("N:N", participants, -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);

        List<TestCase> testCases = List.of(testCase);

        when(this.loadTestConfig.getWorkerMaxLoad()).thenReturn(75);

        CreateParticipantResponse failureResponse = new CreateParticipantResponse(false, "Any reason", "connectionId3",
                -1, -1, "", "", 0, "");

        // First 4 are for estimation, shoudl return 4 browsers per worker
        createEstimationResponseMock(instance1Url, testCase);

        int userCounter = 1;
        int sessionCounter = 1;
        for (Instance instance : allInstances) {
            for (int i = 0; i < 4; i++) {
                if (!((userCounter == 7) && (sessionCounter == 2))) {
                    createSuccessfulResponsesMock(instance.publicDnsName(), testCase, 4, userCounter, sessionCounter, 8,
                            -1);
                }
                if (userCounter < 8) {
                    userCounter++;
                } else {
                    userCounter = 1;
                    sessionCounter++;
                }
            }
        }
        // Failure when adding participant
        when(this.browserEmulatorClient.createPublisher(rampUpInstances.get(1).publicDnsName(), 7, 2, testCase))
                .thenReturn(
                        failureResponse);

        // Test start
        this.loadTestController.startLoadTests(testCases);

        List<String> instanceUrls = allInstances.stream().map(Instance::publicDnsName).toList();
        verify(this.kibanaClient, times(1)).importDashboards();
        for (Instance instance : allInstances) {
            String instanceUrl = instance.publicDnsName();
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instance.publicDnsName()), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        userCounter = 1;
        sessionCounter = 1;
        // Check all minimum used instances
        for (Instance instance : allInstances.subList(0, 3)) {
            String instanceUrl = instance.publicDnsName();
            for (int i = 0; i < 4; i++) {
                // Last one may be called may not be called depending on number of cores
                if (!((userCounter == 8) && (sessionCounter == 2))) {
                    verify(this.browserEmulatorClient, times(1)).createPublisher(instanceUrl, userCounter,
                            sessionCounter, testCase);
                }
                if (userCounter < 8) {
                    userCounter++;
                } else {
                    userCounter = 1;
                    sessionCounter++;
                }
            }
        }
        verify(this.browserEmulatorClient, times(1)).disconnectAll(List.of(instance1Url));
        verify(this.browserEmulatorClient, times(1)).disconnectAll(instanceUrls);
        verify(this.ec2Client, times(1)).stopInstance(allInstances);

        // Check result report
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void OneSession1xNTestStartingParticipantsThenBatches() throws Exception {
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        int workersAtStart = 40;
        when(this.loadTestConfig.getWorkersNumberAtTheBeginning()).thenReturn(workersAtStart);
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(5);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(0);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(0);
        when(this.loadTestConfig.isBatches()).thenReturn(true);
        when(this.loadTestConfig.isWaitCompletion()).thenReturn(true);
        when(this.loadTestConfig.getBatchMaxRequests()).thenReturn(5);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(1);

        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        // Create list of instances for ec2 client mock
        List<Instance> instances = new ArrayList<>(workersAtStart);
        for (int i = 0; i < workersAtStart; i++) {
            instances.add(generateRandomInstance());
        }

        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }

        List<String> participants = List.of("1:10");

        TestCase testCase = new TestCase("ONE_SESSION_NXM", participants, -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);
        testCase.setStartingParticipants(30);
        List<TestCase> testCases = List.of(testCase);

        int userCounter = 1;
        for (Instance instance : instances.subList(0, 39)) {
            createSuccessfulResponsesMock(instance.publicDnsName(), testCase, 1, userCounter, 1, -1, 1);
            userCounter++;
        }
        // Failure when adding participant
        CreateParticipantResponse failureResponse = new CreateParticipantResponse(false, "Any reason", "connectionId3",
                -1, -1, "", "", 0, "");
        when(this.browserEmulatorClient.createSubscriber(instances.get(39).publicDnsName(), workersAtStart, 1,
                testCase)).thenReturn(
                        failureResponse);

        // Test start
        this.loadTestController.startLoadTests(testCases);

        List<String> instanceUrls = instances.stream().map(Instance::publicDnsName).toList();
        verify(this.kibanaClient, times(1)).importDashboards();
        for (Instance instance : instances) {
            String instanceUrl = instance.publicDnsName();
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instance.publicDnsName()), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        // Verify total create calls: publishers and subscribers as per topology
        int expectedPublishers = testCase.getPublisherCount(0);
        int expectedSubscribers = testCase.getSubscriberCount(0);
        verify(this.browserEmulatorClient, times(expectedPublishers)).createPublisher(anyString(), anyInt(), anyInt(),
                eq(testCase));
        verify(this.browserEmulatorClient, times(expectedSubscribers)).createSubscriber(anyString(), anyInt(), anyInt(),
                eq(testCase));
        verify(this.browserEmulatorClient, times(1)).disconnectAll(instanceUrls);
        verify(this.ec2Client, times(1)).stopInstance(instances);

        verify(this.sleeper, atLeast(1)).sleep(eq(5), anyString());

        // Check result report
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void noWorkersAvailableProdManualTest() throws Exception {
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        int workersAtStart = 5;
        when(this.loadTestConfig.getWorkersNumberAtTheBeginning()).thenReturn(workersAtStart);
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(1);
        when(this.loadTestConfig.getWorkerMaxLoad()).thenReturn(75);

        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        // Create list of instances for ec2 client mock

        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        List<Instance> instances = new ArrayList<>(workersAtStart);
        for (int i = 0; i < workersAtStart; i++) {
            instances.add(generateRandomInstance());
        }
        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));
        List<String> participants = List.of("1:10");
        TestCase testCase = new TestCase("ONE_SESSION_NXM", participants, -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.FIREFOX);
        createEstimationResponseMock(null, testCase);

        List<TestCase> testCases = List.of(testCase);
        this.loadTestController.startLoadTests(testCases);
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void noWorkersAvailableProdAutoTest() throws Exception {
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        int workersAtStart = 5;
        when(this.loadTestConfig.getWorkersNumberAtTheBeginning()).thenReturn(workersAtStart);
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(false);
        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        // Create list of instances for ec2 client mock
        Instance instance1 = generateRandomInstance();
        String instance1Url = instance1.publicDnsName();
        List<Instance> instances = new ArrayList<>(workersAtStart);
        instances.add(instance1);
        for (int i = 0; i < workersAtStart - 1; i++) {
            instances.add(generateRandomInstance());
        }
        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));
        List<String> participants = List.of("8");
        TestCase testCase = new TestCase("N:N", participants, 10,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);
        when(this.loadTestConfig.getWorkerMaxLoad()).thenReturn(75); // 4 browsers per worker
        createEstimationResponseMock(instance1Url, testCase);
        List<TestCase> testCases = List.of(testCase);
        this.loadTestController.startLoadTests(testCases);
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void NxNTest8ParticipantsDev() throws Exception {
        List<String> devWorkers = new ArrayList<>(3);
        devWorkers.add("127.0.0.1");
        devWorkers.add("192.168.0.2");
        devWorkers.add("192.168.0.3");
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(devWorkers);
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(5);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(0);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(0);
        when(this.loadTestConfig.isBatches()).thenReturn(true);
        when(this.loadTestConfig.isWaitCompletion()).thenReturn(true);
        when(this.loadTestConfig.getBatchMaxRequests()).thenReturn(10);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        int usersPerWorker = 10;
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(usersPerWorker);
        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        List<String> participants = List.of("8");

        TestCase testCase = new TestCase("N:N", participants, 3,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);
        List<TestCase> testCases = List.of(testCase);

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (String instanceUrl : devWorkers) {
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }
        int instance1StartingUser = 1; // Adds 8 users in session 1 and 2 in session 2
        int instance2StartingUser = 3; // Adds 6 users in session 2 and 4 in session 3
        int instance3StartingUser = 5; // Adds 4 users in session 3 and 6 in session 4
        List<Integer> startingUsers = List.of(instance1StartingUser, instance2StartingUser, instance3StartingUser);
        int instance1StartingSession = 1;
        int instance2StartingSession = 2;
        int instance3StartingSession = 3;
        List<Integer> startingSessions = List.of(instance1StartingSession, instance2StartingSession,
                instance3StartingSession);
        int userCounter = 1;
        int sessionCounter = 1;
        for (int i = 0; i < devWorkers.size(); i++) {
            String instanceUrl = devWorkers.get(i);
            createSuccessfulResponsesMock(instanceUrl, testCase, usersPerWorker, startingUsers.get(i),
                    startingSessions.get(i), 8, -1);
            if (userCounter < 8) {
                userCounter++;
            } else {
                userCounter = 1;
                sessionCounter++;
            }
        }
        // Test start
        this.loadTestController.startLoadTests(testCases);

        verify(this.kibanaClient, times(1)).importDashboards();
        for (String instanceUrl : devWorkers) {
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instanceUrl), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        // Verify total number of publishers created equals expected (participants per
        // session * sessions)
        int expectedPublishers = testCase.getParticipantCount(0) * testCase.getSessions();
        verify(this.browserEmulatorClient, times(expectedPublishers)).createPublisher(anyString(), anyInt(), anyInt(),
                eq(testCase));
        verify(this.browserEmulatorClient, times(1)).disconnectAll(devWorkers);

        verify(this.sleeper, atLeast(1)).sleep(eq(5), anyString());

        // Check result report
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    @Test
    void NxNTest8ParticipantsDevWithEstimation() throws Exception {
        List<String> devWorkers = new ArrayList<>(3);
        devWorkers.add("127.0.0.1");
        devWorkers.add("192.168.0.2");
        devWorkers.add("192.168.0.3");
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(devWorkers);
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(5);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(0);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(0);
        when(this.loadTestConfig.isBatches()).thenReturn(true);
        when(this.loadTestConfig.isWaitCompletion()).thenReturn(true);
        when(this.loadTestConfig.getBatchMaxRequests()).thenReturn(10);
        when(this.loadTestConfig.isManualParticipantsAllocation()).thenReturn(false);
        when(this.loadTestConfig.getWorkerMaxLoad()).thenReturn(75);
        when(this.loadTestConfig.getUsersPerWorker()).thenReturn(8);
        String estimationWorker = devWorkers.get(0);
        this.loadTestController = new LoadTestService(browserEmulatorClient, loadTestConfig, kibanaClient,
                elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO, sleeper, workerUrlResolver);
        List<String> participants = List.of("8");

        TestCase testCase = new TestCase("N:N", participants, 2,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true, Browser.CHROME);
        List<TestCase> testCases = List.of(testCase);

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (String instanceUrl : devWorkers) {
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }
        createEstimationResponseMock(estimationWorker, testCase); // 4 browsers per worker
        int instance1StartingUser = 1; // Adds 4 users in session 1
        int instance2StartingUser = 5; // Adds 4 users in session 1
        int instance3StartingUser = 1; // Adds 4 users in session 2
        List<Integer> startingUsers = List.of(instance1StartingUser, instance2StartingUser, instance3StartingUser);
        int instance1StartingSession = 1;
        int instance2StartingSession = 1;
        int instance3StartingSession = 2;
        List<Integer> startingSessions = List.of(instance1StartingSession, instance2StartingSession,
                instance3StartingSession);
        int userCounter = 1;
        int sessionCounter = 1;
        for (int i = 0; i < devWorkers.size(); i++) {
            String instanceUrl = devWorkers.get(i);
            createSuccessfulResponsesMock(instanceUrl, testCase, 4, startingUsers.get(i), startingSessions.get(i), 8,
                    -1);
            if (userCounter < 8) {
                userCounter++;
            } else {
                userCounter = 1;
                sessionCounter++;
            }
        }
        // Test start
        this.loadTestController.startLoadTests(testCases);
        verify(this.kibanaClient, times(1)).importDashboards();
        for (String instanceUrl : devWorkers) {
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instanceUrl), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        userCounter = 1;
        sessionCounter = 1;
        // Check all minimum used instances
        for (int i = 0; i < devWorkers.size(); i++) {
            String instanceUrl = devWorkers.get(i);
            // Last one may be called may not be called depending on number of cores
            for (int j = 0; j < 4; j++) {
                verify(this.browserEmulatorClient, times(1)).createPublisher(instanceUrl, userCounter, sessionCounter,
                        testCase);
                if (userCounter < 8) {
                    userCounter++;
                } else {
                    userCounter = 1;
                    sessionCounter++;
                }
            }
        }
        verify(this.browserEmulatorClient, times(1)).disconnectAll(devWorkers);

        verify(this.sleeper, atLeast(1)).sleep(eq(5), anyString());

        // Check result report
        verify(this.dataIO, times(1)).exportAllResults(any());
    }

    private void createEstimationResponseMock(String instance1Url, TestCase testCase) {
        when(this.browserEmulatorClient.createPublisher(instance1Url, 0, 0, testCase)).thenReturn(
                new CreateParticipantResponse(true, "", "connectionId1", 1, 1, "User0", "LoadTestSession0", 5, ""));
        when(this.browserEmulatorClient.createPublisher(instance1Url, 1, 0, testCase)).thenReturn(
                new CreateParticipantResponse(true, "", "connectionId2", 4, 2, "User1", "LoadTestSession0", 15, ""));
        when(this.browserEmulatorClient.createPublisher(instance1Url, 2, 0, testCase)).thenReturn(
                new CreateParticipantResponse(true, "", "connectionId3", 9, 3, "User2", "LoadTestSession0", 40, ""));
        when(this.browserEmulatorClient.createPublisher(instance1Url, 3, 0, testCase)).thenReturn(
                new CreateParticipantResponse(true, "", "connectionId4", 16, 4, "User3", "LoadTestSession0", 80, ""));
    }

    private void createSuccessfulResponsesMock(String instanceUrl, TestCase testCase, int usersInWorker,
            int startingUser, int session, int maxUsersPerSession, int lastPublisher) {
        int currentSession = session;
        for (int i = startingUser; i < startingUser + usersInWorker; i++) {
            int streamsInWorker = startingUser < (usersInWorker + 1) ? i * i : i * i + usersInWorker;
            int user;
            if (maxUsersPerSession != -1) {
                user = i % maxUsersPerSession;
                if (user == 0)
                    user = maxUsersPerSession;
            } else {
                user = i;
            }
            CreateParticipantResponse response = new CreateParticipantResponse(
                    true, "", "connectionId" + i, streamsInWorker, i, "User" + user,
                    "LoadTestSession" + currentSession, 0, instanceUrl);
            if (testCase.getTopology().equals(Topology.N_X_N)) {
                when(this.browserEmulatorClient.createPublisher(instanceUrl, user, currentSession, testCase))
                        .thenReturn(
                                response);
            } else {
                if (i <= lastPublisher) {
                    when(this.browserEmulatorClient.createPublisher(instanceUrl, user, currentSession, testCase))
                            .thenReturn(
                                    response);
                } else {
                    when(this.browserEmulatorClient.createSubscriber(instanceUrl, user, currentSession, testCase))
                            .thenReturn(
                                    response);
                }
            }
            if (user == maxUsersPerSession) {
                currentSession++;
            }
        }
    }

    private WebSocketClient mockWebSocket(String url) {
        WebSocketClient session = mock(WebSocketClient.class);
        when(this.webSocketConnectionFactory.createConnection("ws://" + url + ":5001/events")).thenReturn(session);
        return session;
    }
}
