package io.openvidu.loadtest.models.testcase.request.modules;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.request.CreateUserRequestBody;

public class LKCreateUserRequestBody extends CreateUserRequestBody {

    private String apiKey;
    private String apiSecret;
    // Only meaningful for real browsers: custom-emulated's publish pipeline is hardcoded to h264.
    private String videoCodec;

    public LKCreateUserRequestBody(LKLoadTestConfig config, TestCase testCase, boolean video, boolean audio,
            Role role, String userId, String sessionId) {
        super(config, testCase, video, audio, role, userId, sessionId);
        this.apiKey = config.getApiKey();
        this.apiSecret = config.getApiSecret();
        boolean codecAppliesToBrowser = testCase.getBrowser() == Browser.CHROME
                || testCase.getBrowser() == Browser.FIREFOX;
        this.videoCodec = codecAppliesToBrowser ? testCase.getVideoCodec() : null;
    }

    @Override
    public JsonObject toJson() {
        JsonObject jsonBody = super.toJson();

        if (this.videoCodec != null && !this.videoCodec.isBlank()) {
            jsonBody.getAsJsonObject("properties").addProperty("videoCodec", this.videoCodec);
        }

        boolean nullKeys = (this.apiKey == null) || (this.apiSecret == null);
        boolean emptyKeys = nullKeys || (this.apiKey.isEmpty()) || (this.apiSecret.isEmpty());
        if (emptyKeys) {
            return jsonBody;
        }
        jsonBody.addProperty("livekitApiKey", this.apiKey);
        jsonBody.addProperty("livekitApiSecret", this.apiSecret);

        return jsonBody;
    }
}
