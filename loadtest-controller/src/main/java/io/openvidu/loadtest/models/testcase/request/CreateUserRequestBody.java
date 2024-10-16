package io.openvidu.loadtest.models.testcase.request;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;

public class CreateUserRequestBody {

	private String userId = "";
	private String sessionName = "";
	private String token = "";
	private OpenViduRole role = OpenViduRole.PUBLISHER;
	private boolean audio = true;
	private boolean video = true;
	private Resolution resolution = Resolution.MEDIUM;
	private OpenViduRecordingMode openviduRecordingMode;
	private int frameRate = 30;
	private boolean browserRecording = false;
	private boolean showVideoElements = true;
	private boolean headlessBrowser = false;
	private String recordingMetadata = "";
	private String openviduUrl = "";
	private String openviduSecret = "";


    public CreateUserRequestBody(LoadTestConfig config, TestCase testCase, boolean video, boolean audio, OpenViduRole role, String userId, String sessionId) {

        this.openviduUrl = config.getOpenViduUrl();
        this.openviduSecret = config.getOpenViduSecret();
        this.userId = userId;
        this.sessionName = sessionId;
        this.role = role;
        this.audio = audio;
        this.video = video;
        this.resolution = testCase.getResolution();
        this.openviduRecordingMode = testCase.getOpenviduRecordingMode();
        this.frameRate = testCase.getFrameRate();
        this.browserRecording = testCase.isBrowserRecording();
        this.showVideoElements = testCase.isShowBrowserVideoElements();
        this.headlessBrowser = testCase.isHeadlessBrowser();
        this.recordingMetadata = testCase.getRecordingMetadata();
    }

    public void setToken(String token) {
        this.token = token;
    }

    public JsonObject toJson() {
        JsonObject jsonBody = new JsonObject();
        jsonBody.addProperty("openviduUrl", this.openviduUrl);
        jsonBody.addProperty("openviduSecret", this.openviduSecret);

        JsonObject properties = new JsonObject();

        properties.addProperty("userId", this.userId);
        properties.addProperty("sessionName", this.sessionName);
        properties.addProperty("role", this.role.getValue());
        properties.addProperty("audio", this.audio);
        properties.addProperty("video", this.video);
        properties.addProperty("resolution", this.resolution.getValue());
        properties.addProperty("frameRate", this.frameRate);

        if (!token.isEmpty()) {
            properties.addProperty("token", this.token);
        }
        if (this.openviduRecordingMode != null && !this.openviduRecordingMode.getValue().isEmpty()) {
            properties.addProperty("recordingOutputMode", this.openviduRecordingMode.getValue());
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
