package io.openvidu.loadtest.models.testcase.request.modules;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.request.CreateUserRequestBody;

public class LKCreateUserRequestBody extends CreateUserRequestBody {

    private String livekitApiKey;
    private String livekitApiSecret;

    public LKCreateUserRequestBody(LKLoadTestConfig config, TestCase testCase, boolean video, boolean audio,
            OpenViduRole role, String userId, String sessionId) {
        super(config, testCase, video, audio, role, userId, sessionId);
        this.livekitApiKey = config.getLivekitApiKey();
        this.livekitApiSecret = config.getLivekitApiSecret();
    }

    public JsonObject toJson() {
        JsonObject jsonBody = super.toJson();
        jsonBody.addProperty("livekitApiKey", this.livekitApiKey);
        jsonBody.addProperty("livekitApiSecret", this.livekitApiSecret);

        return jsonBody;
    }
}
