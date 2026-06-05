package io.openvidu.loadtest.config.modules;

import jakarta.annotation.PostConstruct;

import org.springframework.core.env.Environment;

import io.openvidu.loadtest.config.LoadTestConfig;

public class LKLoadTestConfig extends LoadTestConfig {

    protected LKLoadTestConfig(Environment env) {
        super(env);
    }

    private String apiKey;

    private String apiSecret;

    public String getApiKey() {
        return apiKey;
    }

    public String getApiSecret() {
        return apiSecret;
    }

    @Override
    @PostConstruct
    protected void checkConfigurationProperties() {
        this.apiKey = asOptionalString("platform.apiKey");
        this.apiSecret = asOptionalString("platform.apiSecret");
        super.checkConfigurationProperties();
    }

}
