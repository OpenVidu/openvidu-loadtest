package io.openvidu.loadtest.integration.config;

import java.util.List;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import io.openvidu.loadtest.services.WorkerUrlResolver;
import software.amazon.awssdk.services.ec2.model.Instance;

/**
 * Spring configuration for integration tests.
 */
@TestConfiguration
public class IntegrationTestConfig {

    @Bean
    @Primary
    public WorkerUrlResolver testWorkerUrlResolver() {
        return new WorkerUrlResolver() {
            @Override
            public String resolveUrl(Instance instance) {
                return "localhost";
            }

            @Override
            public List<String> resolveUrls(List<Instance> instances) {
                return instances.stream().map(i -> "localhost").toList();
            }
        };
    }
}
