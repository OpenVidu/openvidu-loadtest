package io.openvidu.loadtest.unit.services;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Sleeper;
import io.openvidu.loadtest.services.WorkerUrlResolver;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

class BrowserEmulatorClientTests {

    private BrowserEmulatorClient browserEmulatorClient;

    private CustomHttpClient httpClientMock;
    private LKLoadTestConfig loadTestConfigMock;
    private JsonUtils jsonUtilsMock;
    private Sleeper sleeper;
    private WorkerUrlResolver workerUrlResolver;

    @BeforeEach
    void setUp() {
        this.httpClientMock = mock(CustomHttpClient.class);
        this.loadTestConfigMock = mock(LKLoadTestConfig.class);
        this.jsonUtilsMock = mock(JsonUtils.class);
        this.sleeper = mock(Sleeper.class);
        this.workerUrlResolver = mock(WorkerUrlResolver.class);

        when(this.loadTestConfigMock.getVideoType()).thenReturn("BUNNY");
        when(this.loadTestConfigMock.getVideoWidth()).thenReturn(640);
        when(this.loadTestConfigMock.getVideoHeight()).thenReturn(480);
        when(this.loadTestConfigMock.getVideoFps()).thenReturn(30);
        when(this.loadTestConfigMock.isQoeAnalysisRecordings()).thenReturn(false);
        when(this.loadTestConfigMock.getPaddingDuration()).thenReturn(-1);
        when(this.loadTestConfigMock.getFragmentDuration()).thenReturn(-1);
        when(this.loadTestConfigMock.getElasticsearchHost()).thenReturn("https://localhost:9200");
        when(this.loadTestConfigMock.getElasticsearchUserName()).thenReturn("elasticadmin");
        when(this.loadTestConfigMock.getElasticsearchPassword()).thenReturn("passwordtest");
        when(this.loadTestConfigMock.getAwsAccessKey()).thenReturn("abc123");
        when(this.loadTestConfigMock.getAwsSecretAccessKey()).thenReturn("def456");
        when(this.loadTestConfigMock.getS3BucketName()).thenReturn("bucketS3");
        when(this.loadTestConfigMock.getS3Host()).thenReturn("");
        when(this.loadTestConfigMock.getS3HostAccessKey()).thenReturn("");
        when(this.loadTestConfigMock.getS3HostSecretKey()).thenReturn("");
        when(this.loadTestConfigMock.getS3Region()).thenReturn("us-east-1");
        when(this.loadTestConfigMock.getAwsAccessKey()).thenReturn("abc123");
        when(this.loadTestConfigMock.getAwsSecretAccessKey()).thenReturn("def456");
        when(this.loadTestConfigMock.getS3BucketName()).thenReturn("bucketS3");
        when(this.loadTestConfigMock.isRetryMode()).thenReturn(true);
        when(this.loadTestConfigMock.getRetryTimes()).thenReturn(5);

        when(this.loadTestConfigMock.getOpenViduUrl()).thenReturn("https://localhost:8080");
        when(this.loadTestConfigMock.getApiKey()).thenReturn("devkey");
        when(this.loadTestConfigMock.getApiSecret()).thenReturn("secret");

        when(this.loadTestConfigMock.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfigMock.getSessionNamePrefix()).thenReturn("LoadTestSession");
        when(this.loadTestConfigMock.isHttpsDisabled()).thenReturn(false);

        this.browserEmulatorClient = new BrowserEmulatorClient(this.loadTestConfigMock, this.httpClientMock,
                this.jsonUtilsMock, this.sleeper, this.workerUrlResolver);
    }

    @Test
    void initializationIsCorrectWithS3Test() throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        this.browserEmulatorClient.initializeInstance("localhost");

        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("elasticSearchHost", "https://localhost:9200");
        expectedBody.addProperty("elasticSearchUserName", "elasticadmin");
        expectedBody.addProperty("elasticSearchPassword", "passwordtest");
        expectedBody.addProperty("elasticSearchIndex", BrowserEmulatorClient.LOADTEST_INDEX);
        expectedBody.addProperty("awsAccessKey", "abc123");
        expectedBody.addProperty("awsSecretAccessKey", "def456");
        expectedBody.addProperty("s3BucketName", "bucketS3");
        expectedBody.addProperty("s3Region", "us-east-1");
        JsonObject video = new JsonObject();
        video.addProperty("videoType", "bunny");
        JsonObject videoInfo = new JsonObject();
        videoInfo.addProperty("width", 640);
        videoInfo.addProperty("height", 480);
        videoInfo.addProperty("fps", 30);
        video.add("videoInfo", videoInfo);
        expectedBody.add("browserVideo", video);
        verify(this.httpClientMock, times(1)).sendPost("https://localhost:5000/instance/initialize", expectedBody, null,
                headers);
    }

    @Test
    void addPublisherSentBodyIsCorrectTest() throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);
        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("livekitApiKey", "devkey");
        expectedBody.addProperty("livekitApiSecret", "secret");
        JsonObject properties = new JsonObject();
        properties.addProperty("userId", "User0");
        properties.addProperty("sessionName", "LoadTestSession0");
        properties.addProperty("role", "PUBLISHER");
        properties.addProperty("audio", true);
        properties.addProperty("video", true);
        properties.addProperty("resolution", "640x480");
        properties.addProperty("frameRate", 30);
        properties.addProperty("recording", false);
        properties.addProperty("showVideoElements", true);
        properties.addProperty("headless", false);
        properties.addProperty("browser", "chrome");
        properties.addProperty("mediaRecorders", false);
        expectedBody.add("properties", properties);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User0");
        responseBody.addProperty("sessionId", "LoadTestSession0");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        when(this.httpClientMock.sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null,
                headers)).thenReturn(response);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        assertTrue(cpr.isResponseOk());
        verify(this.httpClientMock, times(1)).sendPost("https://localhost:5000/openvidu-browser/streamManager",
                expectedBody, null, headers);
    }

    @Test
    void reconnectTest() throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");
        int sessionId = 13;
        int participantId = 2;
        String session = "LoadTestSession" + sessionId;
        String participant = "User" + participantId;
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.body()).thenReturn("");
        when(response.statusCode()).thenReturn(200);
        when(
                this.httpClientMock.sendDelete(
                        "https://localhost:5000/openvidu-browser/streamManager/session/" + session + "/user/"
                                + participant,
                        headers))
                .thenReturn(response);

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("livekitApiKey", "devkey");
        expectedBody.addProperty("livekitApiSecret", "secret");
        JsonObject properties = new JsonObject();
        properties.addProperty("userId", participant);
        properties.addProperty("sessionName", session);
        properties.addProperty("role", "PUBLISHER");
        properties.addProperty("audio", true);
        properties.addProperty("video", true);
        properties.addProperty("resolution", "640x480");
        properties.addProperty("frameRate", 30);
        properties.addProperty("recording", false);
        properties.addProperty("showVideoElements", true);
        properties.addProperty("headless", false);
        properties.addProperty("browser", "chrome");
        properties.addProperty("mediaRecorders", false);
        expectedBody.add("properties", properties);

        @SuppressWarnings("unchecked")
        HttpResponse<String> publishResponse = mock(HttpResponse.class);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User2");
        responseBody.addProperty("sessionId", "LoadTestSession13");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        when(publishResponse.body()).thenReturn(responseString);
        when(publishResponse.statusCode()).thenReturn(200);
        when(this.httpClientMock.sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null,
                headers)).thenReturn(publishResponse);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", participantId,
                sessionId, testCase);
        this.browserEmulatorClient.addClientFailure("localhost", participant, session);
        this.browserEmulatorClient.addClientFailure("localhost", participant, session);

        assertTrue(cpr.isResponseOk());
        verify(this.httpClientMock, times(3)).sendPost("https://localhost:5000/openvidu-browser/streamManager",
                expectedBody, null, headers);
    }

    @Test
    void retryAfterErrorTest() throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.FIREFOX);
        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("livekitApiKey", "devkey");
        expectedBody.addProperty("livekitApiSecret", "secret");
        JsonObject properties = new JsonObject();
        properties.addProperty("userId", "User0");
        properties.addProperty("sessionName", "LoadTestSession0");
        properties.addProperty("role", "PUBLISHER");
        properties.addProperty("audio", true);
        properties.addProperty("video", true);
        properties.addProperty("resolution", "640x480");
        properties.addProperty("frameRate", 30);
        properties.addProperty("recording", false);
        properties.addProperty("showVideoElements", true);
        properties.addProperty("headless", false);
        properties.addProperty("browser", "firefox");
        properties.addProperty("mediaRecorders", false);
        expectedBody.add("properties", properties);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User0");
        responseBody.addProperty("sessionId", "LoadTestSession0");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        @SuppressWarnings("unchecked")
        HttpResponse<String> errorResponse = mock(HttpResponse.class);
        when(errorResponse.statusCode()).thenReturn(500);
        when(errorResponse.body()).thenReturn("error");
        when(this.httpClientMock.sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null,
                headers))
                .thenReturn(errorResponse)
                .thenReturn(errorResponse)
                .thenReturn(response);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        assertTrue(cpr.isResponseOk());
        verify(this.httpClientMock, times(3)).sendPost("https://localhost:5000/openvidu-browser/streamManager",
                expectedBody, null, headers);
    }

    @Test
    void processResponseHandlesNullUserIdAndSessionId() throws IOException, InterruptedException {
        // Mock HTTP response with null userId and sessionId
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.add("userId", null); // null JsonElement
        responseBody.add("sessionId", null); // null JsonElement
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        when(this.httpClientMock.sendPost(anyString(), any(), any(), any())).thenReturn(response);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        // Should still be successful but userId and sessionId should be empty strings
        assertTrue(cpr.isResponseOk());
        assertEquals("", cpr.getUserId());
        assertEquals("", cpr.getSessionId());
    }

    @Test
    void createSubscriberTest() throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);
        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("livekitApiKey", "devkey");
        expectedBody.addProperty("livekitApiSecret", "secret");
        JsonObject properties = new JsonObject();
        properties.addProperty("userId", "User0");
        properties.addProperty("sessionName", "LoadTestSession0");
        properties.addProperty("role", "SUBSCRIBER");
        properties.addProperty("audio", true);
        properties.addProperty("video", true);
        properties.addProperty("resolution", "640x480");
        properties.addProperty("frameRate", 30);
        properties.addProperty("recording", false);
        properties.addProperty("showVideoElements", true);
        properties.addProperty("headless", false);
        properties.addProperty("browser", "chrome");
        properties.addProperty("mediaRecorders", false);
        expectedBody.add("properties", properties);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User0");
        responseBody.addProperty("sessionId", "LoadTestSession0");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        when(this.httpClientMock.sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null,
                headers)).thenReturn(response);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createSubscriber("localhost", 0, 0, testCase);

        assertTrue(cpr.isResponseOk());
        verify(this.httpClientMock, times(1)).sendPost("https://localhost:5000/openvidu-browser/streamManager",
                expectedBody, null, headers);
    }

    @Test
    void isRecordingParticipantCreatedTest() {
        // Test when not created
        boolean result = this.browserEmulatorClient.isRecordingParticipantCreated(1);
        assertFalse(result);
    }

    @Test
    void getRoleInWorkerPublisherTest() {
        // Test getRoleInWorker for PUBLISHER
        when(this.loadTestConfigMock.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfigMock.getSessionNamePrefix()).thenReturn("LoadTestSession");

        int publishers = this.browserEmulatorClient.getRoleInWorker("worker1",
                io.openvidu.loadtest.models.testcase.Role.PUBLISHER);
        assertEquals(0, publishers);
    }

    @Test
    void getRoleInWorkerSubscriberTest() {
        when(this.loadTestConfigMock.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfigMock.getSessionNamePrefix()).thenReturn("LoadTestSession");

        int subscribers = this.browserEmulatorClient.getRoleInWorker("worker1",
                io.openvidu.loadtest.models.testcase.Role.SUBSCRIBER);
        assertEquals(0, subscribers);
    }

    @Test
    void addDisconnectTimestampTest() {
        this.browserEmulatorClient.addDisconnectTimestamp("User1", "LoadTestSession1");
        Map<String, java.util.Calendar> timestamps = this.browserEmulatorClient.getPerUserDisconnectTimestamps();
        assertTrue(timestamps.containsKey("User1-LoadTestSession1"));
    }

    @Test
    void isAnyParticipantReconnectingTest() {
        boolean result = this.browserEmulatorClient.isAnyParticipantReconnecting();
        assertFalse(result);
    }

    @Test
    void getLastErrorReconnectingResponseTest() {
        CreateParticipantResponse result = this.browserEmulatorClient.getLastErrorReconnectingResponse();
        assertNull(result);
    }

    @Test
    void setEndOfTestTest() {
        this.browserEmulatorClient.setEndOfTest(true);
    }

    @Test
    void getRetryStatisticsTest() {
        int[] stats = this.browserEmulatorClient.getRetryStatistics();
        assertEquals(0, stats[0]);
        assertEquals(0, stats[1]);
    }

    @Test
    void getMaxRetriesPerParticipantTest() {
        int max = this.browserEmulatorClient.getMaxRetriesPerParticipant();
        assertEquals(0, max);
    }

    @Test
    void getPerUserRetryCountsTest() {
        Map<String, Integer> counts = this.browserEmulatorClient.getPerUserRetryCounts();
        assertTrue(counts.isEmpty());
    }

    @Test
    void getPerUserRetryAttemptsTest() {
        Map<String, java.util.List<BrowserEmulatorClient.RetryAttempt>> attempts = this.browserEmulatorClient
                .getPerUserRetryAttempts();
        assertTrue(attempts.isEmpty());
    }

    @Test
    void createParticipantWithIOExceptionTest() throws IOException, InterruptedException {
        // Test with generic IOException - simplified to avoid complex mock setup
        when(this.loadTestConfigMock.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfigMock.getSessionNamePrefix()).thenReturn("LoadTestSession");

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        when(this.httpClientMock.sendPost(anyString(), any(), any(), any()))
                .thenThrow(new IOException("Connection failed"));

        // This should handle the exception and return false
        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);
        assertFalse(cpr.isResponseOk());
    }

    @Test
    void createParticipantWithTimeoutExceptionTest() throws IOException, InterruptedException {
        when(this.loadTestConfigMock.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfigMock.getSessionNamePrefix()).thenReturn("LoadTestSession");
        when(this.loadTestConfigMock.isRetryMode()).thenReturn(true);
        when(this.loadTestConfigMock.getRetryTimes()).thenReturn(5);

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        // First call throws timeout, second call succeeds
        @SuppressWarnings("unchecked")
        HttpResponse<String> successResponse = mock(HttpResponse.class);
        when(successResponse.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        String responseString = responseBody.toString();
        when(successResponse.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);

        when(this.httpClientMock.sendPost(anyString(), any(), any(), any()))
                .thenThrow(new IOException("Read timed out"))
                .thenReturn(successResponse);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);
        // Should succeed after retry
        assertTrue(cpr.isResponseOk());
    }

    @Test
    void createParticipantTeachingModeTest() throws IOException, InterruptedException {
        // Test case with teaching mode
        TestCase testCase = new TestCase("TEACHING", Arrays.asList("1", "2"), 1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User0");
        responseBody.addProperty("sessionId", "LoadTestSession0");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        when(this.httpClientMock.sendPost(anyString(), any(), any(), any())).thenReturn(response);

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        assertTrue(cpr.isResponseOk());
    }

    @Test
    void disconnectAllTest() throws Exception {
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("deleted");

        when(this.httpClientMock.sendDelete(anyString(), any())).thenReturn(response);

        this.browserEmulatorClient.disconnectAll(Arrays.asList("worker1", "worker2"));

        verify(this.httpClientMock, times(2)).sendDelete(anyString(), any());
    }

    @Test
    void cleanResetsIsCleanFlagTest() throws IOException, InterruptedException {
        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("livekitApiKey", "devkey");
        expectedBody.addProperty("livekitApiSecret", "secret");
        JsonObject properties = new JsonObject();
        properties.addProperty("userId", "User0");
        properties.addProperty("sessionName", "LoadTestSession0");
        properties.addProperty("role", "PUBLISHER");
        properties.addProperty("audio", true);
        properties.addProperty("video", true);
        properties.addProperty("resolution", "640x480");
        properties.addProperty("frameRate", 30);
        properties.addProperty("recording", false);
        properties.addProperty("showVideoElements", true);
        properties.addProperty("headless", false);
        properties.addProperty("browser", "chrome");
        properties.addProperty("mediaRecorders", false);
        expectedBody.add("properties", properties);

        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User0");
        responseBody.addProperty("sessionId", "LoadTestSession0");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        when(this.httpClientMock.sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null,
                headers)).thenReturn(response);

        this.browserEmulatorClient.clean();

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        assertTrue(cpr.isResponseOk(), "Participant creation should succeed after clean() resets isClean flag");
    }

    @Test
    void multipleCleanCallsAllowParticipantCreationTest() throws IOException, InterruptedException {
        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1,
                30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
                true, Browser.CHROME);

        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Content-Type", "application/json");

        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("livekitApiKey", "devkey");
        expectedBody.addProperty("livekitApiSecret", "secret");
        JsonObject properties = new JsonObject();
        properties.addProperty("userId", "User0");
        properties.addProperty("sessionName", "LoadTestSession0");
        properties.addProperty("role", "PUBLISHER");
        properties.addProperty("audio", true);
        properties.addProperty("video", true);
        properties.addProperty("resolution", "640x480");
        properties.addProperty("frameRate", 30);
        properties.addProperty("recording", false);
        properties.addProperty("showVideoElements", true);
        properties.addProperty("headless", false);
        properties.addProperty("browser", "chrome");
        properties.addProperty("mediaRecorders", false);
        expectedBody.add("properties", properties);

        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        JsonObject responseBody = new JsonObject();
        responseBody.addProperty("connectionId", "connectionId");
        responseBody.addProperty("workerCpuUsage", 0.0);
        responseBody.addProperty("streams", 2);
        responseBody.addProperty("participants", 1);
        responseBody.addProperty("userId", "User0");
        responseBody.addProperty("sessionId", "LoadTestSession0");
        String responseString = responseBody.toString();
        when(response.body()).thenReturn(responseString);
        when(jsonUtilsMock.getJson(responseString)).thenReturn(responseBody);
        when(this.httpClientMock.sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null,
                headers)).thenReturn(response);

        this.browserEmulatorClient.clean();
        this.browserEmulatorClient.clean();
        this.browserEmulatorClient.clean();

        CreateParticipantResponse cpr = this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        assertTrue(cpr.isResponseOk(), "Participant creation should succeed after multiple clean() calls");
    }

}