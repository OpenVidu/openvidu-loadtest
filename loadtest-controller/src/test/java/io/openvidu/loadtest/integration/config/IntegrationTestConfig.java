package io.openvidu.loadtest.integration.config;

import org.springframework.boot.test.context.TestConfiguration;

/**
 * Spring configuration for integration tests.
 * This is a placeholder configuration class.
 * The actual configuration is handled by:
 * 1. @TestPropertySource to set LOADTEST_CONFIG and RESULTS_DIR
 * 2. The existing LoadTestConfigSelector which creates LKLoadTestConfig
 * 3. The test config YAML file with appropriate settings
 */
@TestConfiguration
public class IntegrationTestConfig {
    // Configuration is handled by @TestPropertySource in the test class
}