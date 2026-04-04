package io.openvidu.loadtest.models.testcase.request;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.config.modules.OVLoadTestConfig;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.request.modules.LKCreateUserRequestBody;
import io.openvidu.loadtest.models.testcase.request.modules.OVCreateUserRequestBody;

public class CreateUserRequestBodyFactory {
    private CreateUserRequestBodyFactory() {
        /* This utility class should not be instantiated */
    }

    public static CreateUserRequestBody create(LoadTestConfig config, TestCase testCase, boolean video, boolean audio,
            Role role, String userId, String sessionId) {
        if (config instanceof LKLoadTestConfig lkConfig) {
            return new LKCreateUserRequestBody(lkConfig, testCase, video, audio, role, userId,
                    sessionId);
        } else if (config instanceof OVLoadTestConfig ovConfig) {
            return new OVCreateUserRequestBody(ovConfig, testCase,
                    video, audio, role, userId, sessionId);
        }
        throw new IllegalArgumentException(
                "Unable to create request body. Please check your configuration.");
    }
}
