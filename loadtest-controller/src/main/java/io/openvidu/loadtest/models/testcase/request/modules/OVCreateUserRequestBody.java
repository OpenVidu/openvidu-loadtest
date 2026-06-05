package io.openvidu.loadtest.models.testcase.request.modules;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.modules.OVLoadTestConfig;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.request.CreateUserRequestBody;

public class OVCreateUserRequestBody extends CreateUserRequestBody {

    private String openviduSecret = "";
    private OpenViduRecordingMode openviduRecordingMode;

    public OVCreateUserRequestBody(OVLoadTestConfig config, TestCase testCase, boolean video, boolean audio,
            Role role, String userId, String sessionId) {
        super(config, testCase, video, audio, role, userId, sessionId);
        this.openviduSecret = config.getOpenViduSecret();
        this.openviduRecordingMode = testCase.getOpenviduRecordingMode();
    }

    @Override
    public JsonObject toJson() {
        JsonObject jsonBody = super.toJson();
        jsonBody.addProperty("openviduSecret", this.openviduSecret);
        JsonObject properties = jsonBody.getAsJsonObject("properties");
        if (this.openviduRecordingMode != null && !this.openviduRecordingMode.getValue().isEmpty()) {
            properties.addProperty("recordingOutputMode", this.openviduRecordingMode.getValue());
        }
        return jsonBody;
    }
}