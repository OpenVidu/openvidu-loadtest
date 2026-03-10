package io.openvidu.loadtest.models.testcase.request;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;

public abstract class CreateUserRequestBody {

    private String userId = "";
    private String sessionName = "";
    private String token = "";
    private Role role = Role.PUBLISHER;
    private boolean audio = true;
    private boolean video = true;
    private Resolution resolution = Resolution.MEDIUM;
    private int frameRate = 30;
    private boolean browserRecording = false;
    private boolean showVideoElements = true;
    private boolean headlessBrowser = false;
    private String recordingMetadata = "";
    private String openviduUrl = "";
    private Browser browser = Browser.CHROME;
    private boolean mediaRecorders = false;

    protected CreateUserRequestBody(LoadTestConfig config, TestCase testCase, boolean video, boolean audio,
            Role role, String userId, String sessionId) {
        this.openviduUrl = config.getOpenViduUrl();
        this.userId = userId;
        this.sessionName = sessionId;
        this.role = role;
        this.browser = testCase.getBrowser();
        this.audio = audio;
        this.video = video;
        this.resolution = testCase.getResolution();
        this.frameRate = testCase.getFrameRate();
        this.browserRecording = testCase.isBrowserRecording();
        this.showVideoElements = testCase.isShowBrowserVideoElements();
        this.headlessBrowser = testCase.isHeadlessBrowser();
        this.recordingMetadata = testCase.getRecordingMetadata();
        this.mediaRecorders = config.isQoeAnalysisRecordings();
    }

    public void setToken(String token) {
        this.token = token;
    }

    public JsonObject toJson() {
        JsonObject jsonBody = new JsonObject();
        jsonBody.addProperty("openviduUrl", this.openviduUrl);

        JsonObject properties = new JsonObject();

        properties.addProperty("userId", this.userId);
        properties.addProperty("sessionName", this.sessionName);
        properties.addProperty("role", this.role.getValue());
        properties.addProperty("audio", this.audio);
        properties.addProperty("video", this.video);
        properties.addProperty("resolution", this.resolution.getValue());
        properties.addProperty("frameRate", this.frameRate);
        properties.addProperty("browser", this.browser.getValue());
        properties.addProperty("mediaRecorders", this.mediaRecorders);

        if (!token.isEmpty()) {
            properties.addProperty("token", this.token);
        }
        properties.addProperty("recording", this.browserRecording);
        properties.addProperty("showVideoElements", this.showVideoElements);
        properties.addProperty("headless", this.headlessBrowser);

        if (!this.recordingMetadata.isBlank()) {
            properties.addProperty("recordingMetadata", this.recordingMetadata);
        }
        jsonBody.add("properties", properties);
        return jsonBody;
    }
}
