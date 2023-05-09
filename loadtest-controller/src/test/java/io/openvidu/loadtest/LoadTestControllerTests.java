package io.openvidu.loadtest;

import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.stream.Collectors;
import java.util.stream.Stream;


import org.apache.commons.lang3.RandomStringUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.amazonaws.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.controller.LoadTestController;
import io.openvidu.loadtest.models.testcase.BrowserMode;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WebSocketClient;
import io.openvidu.loadtest.services.WebSocketConnectionFactory;
import io.openvidu.loadtest.utils.DataIO;

public class LoadTestControllerTests {
    
    @Mock
    private BrowserEmulatorClient browserEmulatorClient;
    
    @Mock
    private LoadTestConfig loadTestConfig;

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

    private LoadTestController loadTestController;

    @BeforeEach
    public void init() {
        MockitoAnnotations.openMocks(this);
        this.loadTestController = new LoadTestController(browserEmulatorClient, loadTestConfig, kibanaClient, elasticSearchClient, ec2Client, webSocketConnectionFactory, dataIO);

        when(this.loadTestConfig.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfig.getSessionNamePrefix()).thenReturn("LoadTestSession");
        when(this.loadTestConfig.getWorkerUrlList()).thenReturn(new ArrayList<>(1));
        when(this.loadTestConfig.isTerminateWorkers()).thenReturn(false);
        when(this.loadTestConfig.isKibanaEstablished()).thenReturn(true);
        when(this.loadTestConfig.getSecondsToWaitBetweenParticipants()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBetweenSession()).thenReturn(1);
        when(this.loadTestConfig.getSecondsToWaitBeforeTestFinished()).thenReturn(5);
        // Uncomment if need to test specific number of in flight requests (cores + 1 by default)
        when(this.loadTestConfig.getMaxRequests()).thenReturn(17);

    }

    private Instance generateRandomInstance() {
        Instance instance = new Instance();

        Random random = new Random();
        instance.setInstanceId("i-" + RandomStringUtils.random(17, true, true).toLowerCase());
        instance.setPublicDnsName("ec2-" + random.nextInt(255) + "-" 
            + random.nextInt(255) + "-" + random.nextInt(255) + "-" + random.nextInt(255) + 
            ".compute-1.amazonaws.com");
        return instance;
    }

    @Test
    public void NxNTest8ParticipantsWithEstimationWithRampUpNoQOENoRecording() {
        when(this.loadTestConfig.isQoeAnalysisInSitu()).thenReturn(false);
        when(this.loadTestConfig.isQoeAnalysisRecordings()).thenReturn(false);
        when(this.loadTestConfig.getWorkersRumpUp()).thenReturn(1);

        // Create list of instances for ec2 client mock
        Instance instance1 = generateRandomInstance();
        Instance instance2 = generateRandomInstance();
        String instance1Url = instance1.getPublicDnsName();
        List<Instance> instances = List.of(instance1, instance2);

        List<Instance> rampUpInstances = new ArrayList<>();
        for (int i = 0; i < 80; i++) {
            rampUpInstances.add(generateRandomInstance());
        }

        List<Instance> allInstances = Stream.concat(instances.stream(), rampUpInstances.stream())
            .collect(Collectors.toList());

        when(this.ec2Client.launchAndCleanInitialInstances()).thenReturn(instances);
        when(this.ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(new ArrayList<>(1));
        when(this.ec2Client.launchInstance(1, WorkerType.WORKER)).thenReturn(rampUpInstances);

        Map<String, WebSocketClient> webSocketMocks = new HashMap<>();
        for (Instance instance : allInstances) {
            String instanceUrl = instance.getPublicDnsName();
            webSocketMocks.put(instanceUrl, mockWebSocket(instanceUrl));
        }

        List<String> participants = List.of("8");

        TestCase testCase = new TestCase("N:N", participants, -1, BrowserMode.REAL,
            30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false, true);

        List<TestCase> testCases = List.of(testCase);

        when(this.loadTestConfig.getWorkerMaxLoad()).thenReturn(75);

        CreateParticipantResponse failureResponse = new CreateParticipantResponse(false, "Any reason", "connectionId3", -1, -1, "", "", 0);

        // First 4 are for estimation, shoudl return 4 browsers per worker
        createEstimationResponseMock(instance1Url, testCase);
        // Test start

        int userCounter = 1;
        int sessionCounter = 1;
        for (Instance instance : allInstances) {
            for (int i = 0; i < 4; i++) {
                if (!((userCounter == 7) && (sessionCounter == 2))) {
                    createSuccessfullResponsesMock(instance.getPublicDnsName(), testCase, userCounter, sessionCounter);
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
        when(this.browserEmulatorClient.createPublisher(rampUpInstances.get(1).getPublicDnsName(), 7, 2, testCase)).thenReturn(
            failureResponse
        );

        this.loadTestController.startLoadTests(testCases);

        List<String> instanceUrls = allInstances.stream().map(Instance::getPublicDnsName).collect(Collectors.toList());
        verify(this.kibanaClient, times(1)).importDashboards();
        for (Instance instance : allInstances) {
            String instanceUrl = instance.getPublicDnsName();
            verify(this.browserEmulatorClient, times(1)).ping(instanceUrl);
            verify(this.webSocketConnectionFactory, times(1)).createConnection("ws://" + instanceUrl + ":5001/events");
            verify(webSocketMocks.get(instance.getPublicDnsName()), times(1)).close();
            verify(this.browserEmulatorClient, times(1)).initializeInstance(instanceUrl);
        }
        userCounter = 1;
        sessionCounter = 1;
        // Check all minimum used instances
        for (Instance instance : allInstances.subList(0, 3)) {
            String instanceUrl = instance.getPublicDnsName();
            for (int i = 0; i < 4; i++) {
                // Last one may be called may not be called depending on number of cores
                if (!((userCounter == 8) && (sessionCounter == 2))) {
                    verify(this.browserEmulatorClient, times(1)).createPublisher(instanceUrl, userCounter, sessionCounter, testCase);
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

        // TODO: Check result report
        verify(this.dataIO, times(1)).exportResults(any());
    }

    private void createEstimationResponseMock(String instance1Url, TestCase testCase) {
        when(this.browserEmulatorClient.createPublisher(instance1Url, 0, 0, testCase)).thenReturn(
            new CreateParticipantResponse(true, "", "connectionId1", 1, 1, "User0", "LoadTestSession0", 5));
        when(this.browserEmulatorClient.createPublisher(instance1Url, 1, 0, testCase)).thenReturn(
            new CreateParticipantResponse(true, "", "connectionId2", 4, 2, "User1", "LoadTestSession0", 15)
        );
        when(this.browserEmulatorClient.createPublisher(instance1Url, 2, 0, testCase)).thenReturn(
            new CreateParticipantResponse(true, "", "connectionId3", 9, 3, "User2", "LoadTestSession0", 40)
        );
        when(this.browserEmulatorClient.createPublisher(instance1Url, 3, 0, testCase)).thenReturn(
            new CreateParticipantResponse(true, "", "connectionId4", 16, 4, "User3", "LoadTestSession0", 80)
        );
    }

    private void createSuccessfullResponsesMock(String instanceUrl, TestCase testCase, int startingUser, int session) {
        for (int i = startingUser; i < startingUser + 4; i++) {
            int streamsInWorker = startingUser < 5 ? i * i: i * i + 4;
            when(this.browserEmulatorClient.createPublisher(instanceUrl, i, session, testCase)).thenReturn(
                new CreateParticipantResponse(true, "", "connectionId" + i, streamsInWorker, i, "User" + i, "LoadTestSession" + session, 0)
            );
        }
    }

    private WebSocketClient mockWebSocket(String url) {
        WebSocketClient session = mock(WebSocketClient.class);
        when(this.webSocketConnectionFactory.createConnection("ws://" + url + ":5001/events")).thenReturn(session);
        return session;
    }
}
