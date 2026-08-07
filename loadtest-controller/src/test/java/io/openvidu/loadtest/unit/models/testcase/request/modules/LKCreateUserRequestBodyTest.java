package io.openvidu.loadtest.unit.models.testcase.request.modules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.request.modules.LKCreateUserRequestBody;

class LKCreateUserRequestBodyTest {

    private LKLoadTestConfig newConfigMock() {
        LKLoadTestConfig config = mock(LKLoadTestConfig.class);
        when(config.getOpenViduUrl()).thenReturn("wss://livekit.example.com");
        when(config.getApiKey()).thenReturn("apikey");
        when(config.getApiSecret()).thenReturn("apisecret");
        when(config.isQoeAnalysisRecordings()).thenReturn(false);
        return config;
    }

    private TestCase newTestCase(Browser browser, String videoCodec) {
        TestCase testCase = new TestCase("N:N", List.of("4"), 1, 30, Resolution.MEDIUM,
                OpenViduRecordingMode.COMPOSED, false, false, true, browser);
        testCase.setVideoCodec(videoCodec);
        return testCase;
    }

    @Test
    void realBrowserVideoCodecIsIncludedInTheProperties() {
        TestCase testCase = newTestCase(Browser.CHROME, "vp9");
        LKCreateUserRequestBody body = new LKCreateUserRequestBody(newConfigMock(), testCase, true, true,
                Role.PUBLISHER, "user1", "session1");

        JsonObject properties = body.toJson().getAsJsonObject("properties");

        assertEquals("vp9", properties.get("videoCodec").getAsString());
    }

    @Test
    void firefoxVideoCodecIsIncludedInTheProperties() {
        TestCase testCase = newTestCase(Browser.FIREFOX, "av1");
        LKCreateUserRequestBody body = new LKCreateUserRequestBody(newConfigMock(), testCase, true, true,
                Role.PUBLISHER, "user1", "session1");

        JsonObject properties = body.toJson().getAsJsonObject("properties");

        assertEquals("av1", properties.get("videoCodec").getAsString());
    }

    @Test
    void customEmulatedVideoCodecIsOmittedFromTheProperties() {
        // The custom-emulated publish pipeline is hardcoded to h264 regardless of
        // TestCase.videoCodec, so it must not be sent to the browser-emulator
        TestCase testCase = newTestCase(Browser.CUSTOM_EMULATED, "h264");
        LKCreateUserRequestBody body = new LKCreateUserRequestBody(newConfigMock(), testCase, true, true,
                Role.PUBLISHER, "user1", "session1");

        JsonObject properties = body.toJson().getAsJsonObject("properties");

        assertFalse(properties.has("videoCodec"));
    }

    @Test
    void unsetVideoCodecIsOmittedFromTheProperties() {
        TestCase testCase = newTestCase(Browser.CHROME, "");
        LKCreateUserRequestBody body = new LKCreateUserRequestBody(newConfigMock(), testCase, true, true,
                Role.PUBLISHER, "user1", "session1");

        JsonObject properties = body.toJson().getAsJsonObject("properties");

        assertFalse(properties.has("videoCodec"));
    }
}
