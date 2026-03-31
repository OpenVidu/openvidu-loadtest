package io.openvidu.loadtest.utils;

import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

@Component
public class ShutdownManager {
    private ApplicationContext context;

    public void shutdownWithCode(int code) {
        SpringApplication.exit(context, () -> code);
    }
}
