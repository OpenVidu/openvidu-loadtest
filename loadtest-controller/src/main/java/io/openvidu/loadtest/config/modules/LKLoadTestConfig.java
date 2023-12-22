package io.openvidu.loadtest.config.modules;

import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

import org.springframework.core.env.Environment;

import io.openvidu.loadtest.config.LoadTestConfig;

@Component
public class LKLoadTestConfig extends LoadTestConfig {

    protected LKLoadTestConfig(Environment env) {
        super(env);
    }

    private String livekitApiKey;

    private String livekitApiSecret;

    public String getLivekitApiKey() {
        return livekitApiKey;
    }

    public String getLivekitApiSecret() {
        return livekitApiSecret;
    }

    @PostConstruct
    protected void checkConfigurationProperties() {
        this.livekitApiKey = asOptionalString("LIVEKIT_API_KEY");
        this.livekitApiSecret = asOptionalString("LIVEKIT_API_SECRET");
        super.checkConfigurationProperties();
    }

}
