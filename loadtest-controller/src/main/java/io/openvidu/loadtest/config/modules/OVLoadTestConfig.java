package io.openvidu.loadtest.config.modules;

import org.springframework.core.env.Environment;

import io.openvidu.loadtest.config.LoadTestConfig;
import jakarta.annotation.PostConstruct;

public class OVLoadTestConfig extends LoadTestConfig {

    protected OVLoadTestConfig(Environment env) {
        super(env);
    }

    private String openviduSecret;

    public String getOpenViduSecret() {
        return this.openviduSecret;
    }

    @Override
    @PostConstruct
    protected void checkConfigurationProperties() {
        this.openviduSecret = asOptionalString("OPENVIDU_SECRET");
        super.checkConfigurationProperties();
    }

}
