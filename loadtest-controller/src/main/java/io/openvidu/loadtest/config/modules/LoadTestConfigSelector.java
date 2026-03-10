package io.openvidu.loadtest.config.modules;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

import io.openvidu.loadtest.config.LoadTestConfig;

@Configuration
public class LoadTestConfigSelector {

    @Bean
    LoadTestConfig loadTestConfig(Environment env) {
        boolean hasLivekitApiKey = StringUtils.hasText(env.getProperty("LIVEKIT_API_KEY"));
        boolean hasLivekitApiSecret = StringUtils.hasText(env.getProperty("LIVEKIT_API_SECRET"));
        boolean hasOpenViduSecret = StringUtils.hasText(env.getProperty("OPENVIDU_SECRET"));

        if (hasLivekitApiKey && hasLivekitApiSecret) {
            return new LKLoadTestConfig(env);
        }

        if (hasOpenViduSecret) {
            return new OVLoadTestConfig(env);
        }

        throw new IllegalStateException(
                "Unable to create LoadTestConfig. Define LIVEKIT_API_KEY and LIVEKIT_API_SECRET for LiveKit, "
                        + "or OPENVIDU_SECRET for OpenVidu.");
    }
}
