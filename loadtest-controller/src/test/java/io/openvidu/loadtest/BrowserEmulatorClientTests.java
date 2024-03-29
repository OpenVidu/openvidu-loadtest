package io.openvidu.loadtest;

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

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.BrowserMode;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

class BrowserEmulatorClientTests {

    private BrowserEmulatorClient browserEmulatorClient;

    private CustomHttpClient httpClientMock;
    private LoadTestConfig loadTestConfigMock;
    private JsonUtils jsonUtilsMock;
    
    @BeforeEach
    void setUp() {
        this.httpClientMock = mock(CustomHttpClient.class);
        this.loadTestConfigMock = mock(LoadTestConfig.class);
        this.jsonUtilsMock = mock(JsonUtils.class);

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
        when(this.loadTestConfigMock.getMinioAccessKey()).thenReturn("");
        when(this.loadTestConfigMock.getMinioSecretKey()).thenReturn("");
        when(this.loadTestConfigMock.getMinioHost()).thenReturn("");
        when(this.loadTestConfigMock.getMinioPort()).thenReturn(-1);
        when(this.loadTestConfigMock.getMinioBucket()).thenReturn("");
        when(this.loadTestConfigMock.getAwsAccessKey()).thenReturn("abc123");
        when(this.loadTestConfigMock.getAwsSecretAccessKey()).thenReturn("def456");
        when(this.loadTestConfigMock.getS3BucketName()).thenReturn("bucketS3");

        when(this.loadTestConfigMock.getOpenViduUrl()).thenReturn("https://localhost:8080");
        when(this.loadTestConfigMock.getOpenViduSecret()).thenReturn("MYSECRET");
        when(this.loadTestConfigMock.getUserNamePrefix()).thenReturn("User");
        when(this.loadTestConfigMock.getSessionNamePrefix()).thenReturn("LoadTestSession");

        this.browserEmulatorClient = new BrowserEmulatorClient(this.loadTestConfigMock, this.httpClientMock, this.jsonUtilsMock);
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
        JsonObject video = new JsonObject();
        video.addProperty("videoType", "bunny");
        JsonObject videoInfo = new JsonObject();
        videoInfo.addProperty("width", 640);
        videoInfo.addProperty("height", 480);
        videoInfo.addProperty("fps", 30);
        video.add("videoInfo", videoInfo);
        expectedBody.add("browserVideo", video);
        verify(httpClientMock, times(1)).sendPost("https://localhost:5000/instance/initialize", expectedBody, null, headers);
    }

    @Test
    void addPublisherSentBodyIsCorrectTest() throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<String, String>();
		headers.put("Content-Type", "application/json");

        TestCase testCase = new TestCase("N:N", Arrays.asList("2"), -1, BrowserMode.REAL,
            30, Resolution.MEDIUM, OpenViduRecordingMode.NONE, false, false,
            true);

        this.browserEmulatorClient.createPublisher("localhost", 0, 0, testCase);

        JsonObject expectedBody = new JsonObject();
        expectedBody.addProperty("openviduUrl", "https://localhost:8080");
        expectedBody.addProperty("openviduSecret", "MYSECRET");
        expectedBody.addProperty("browserMode", "REAL");
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
        expectedBody.add("properties", properties);
        verify(httpClientMock, times(1)).sendPost("https://localhost:5000/openvidu-browser/streamManager", expectedBody, null, headers);
    }
}
