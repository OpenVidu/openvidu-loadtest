package io.openvidu.loadtest.config.modules;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.config.YamlConfigLoader;

@Configuration
public class LoadTestConfigSelector {

    @Bean
    LoadTestConfig loadTestConfig(Environment env) {
        YamlConfigLoader yamlConfig = new YamlConfigLoader(env);

        String platformType = yamlConfig.getString("platform.type").toLowerCase();

        if ("openvidu2".equals(platformType)) {
            String openviduSecret = yamlConfig.getString("platform.openviduSecret");
            if (!StringUtils.hasText(openviduSecret)) {
                throw new IllegalStateException(
                        "Unable to create OVLoadTestConfig. Define platform.openviduSecret in config.yaml.");
            }
            return new OVLoadTestConfig(env);
        }

        String apiKey = yamlConfig.getString("platform.apiKey");
        String apiSecret = yamlConfig.getString("platform.apiSecret");

        if (StringUtils.hasText(apiKey) && StringUtils.hasText(apiSecret)) {
            return new LKLoadTestConfig(env);
        }

        throw new IllegalStateException(
                "Unable to create LoadTestConfig. Define platform.apiKey and platform.apiSecret in config.yaml.");
    }
}
