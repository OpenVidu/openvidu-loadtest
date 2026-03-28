package io.openvidu.loadtest.unit.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import io.openvidu.loadtest.config.LoadTestConfig;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LoadTestConfigTest {

    private static class TestLoadTestConfig extends LoadTestConfig {
        protected TestLoadTestConfig(org.springframework.core.env.Environment env) {
            super(env);
            // Populate fields from YAML
            checkConfigurationProperties();
        }
    }

    @Test
    void populatesPropertiesFromYamlClasspath() {
        MockEnvironment env = new MockEnvironment();

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // Values come from src/test/resources/config/config.yaml
        assertEquals("https://openvidu-test.io:7443", cfg.getOpenViduUrl());
        assertEquals("LoadTestSession", cfg.getSessionNamePrefix());
        assertTrue(cfg.isManualParticipantsAllocation());
        assertEquals(2, cfg.getUsersPerWorker());

        List<String> workers = cfg.getWorkerUrlList();
        assertNotNull(workers);
        assertFalse(workers.isEmpty());
        assertEquals("browser-emulator", workers.get(0));
    }

    @Test
    void defaultsAndFlagsAreSetCorrectly() {
        MockEnvironment env = new MockEnvironment();
        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // Seconds between sessions not defined in test YAML -> default to 0
        assertEquals(0, cfg.getSecondsToWaitBetweenSession());

        // No monitoring credentials in test YAML -> not secured / not established
        assertFalse(cfg.isElasticSearchSecured());
        assertFalse(cfg.isKibanaEstablished());

        // HTTPS not disabled in YAML
        assertFalse(cfg.isHttpsDisabled());

        // batchMaxRequests should be positive (computed default if not set)
        assertTrue(cfg.getBatchMaxRequests() > 0);
        // If advanced.batches.enabled is not defined, batches should default to true
        assertTrue(cfg.isBatches());
        // Same with waitCompletion, should default to true if not defined
        assertTrue(cfg.isWaitCompletion());
        // Same with retries
        assertTrue(cfg.isRetryMode());
        assertTrue(cfg.isExitOnEnd());
    }

    @Test
    void readsMonitoringOptionsFromAlternateYaml() {
        MockEnvironment env = new MockEnvironment();
        // Load an alternate test YAML that contains monitoring options
        env.setProperty("LOADTEST_CONFIG", "config/monitoring-config.yaml");

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // Monitoring credentials and Kibana host come from monitoring-config.yaml
        assertTrue(cfg.isElasticSearchSecured());
        assertEquals("https://es-test.io:9200", cfg.getElasticsearchHost());
        assertEquals("esuser", cfg.getElasticsearchUserName());
        assertEquals("espwd", cfg.getElasticsearchPassword());
        assertTrue(cfg.isKibanaEstablished());
        assertEquals("https://kibana-test.io:5601", cfg.getKibanaHost());
    }
}
