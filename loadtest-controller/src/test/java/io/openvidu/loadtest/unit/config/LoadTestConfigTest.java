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
        assertTrue(cfg.isExitOnEnd());

        // Neither advanced.retry nor advanced.maxParticipantErrors defined in test
        // YAML -> defaults to maxParticipantErrors=1 (retry disabled), so NORMAL
        // mode always has exactly one active stop-on-error mechanism.
        assertFalse(cfg.isRetryMode());
        assertTrue(cfg.isMaxParticipantErrorsEnabled());
        assertEquals(1, cfg.getMaxParticipantErrors());
        // LOADTEST mode always enforces this regardless, defaulting to 1.
        assertEquals(1, cfg.getEffectiveMaxParticipantErrorsForLoadTestMode());
    }

    @Test
    void readsMaxParticipantErrorsFromYaml() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("LOADTEST_CONFIG", "config/max-participant-errors-config.yaml");

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // Only maxParticipantErrors explicitly configured -> retry stays disabled
        assertFalse(cfg.isRetryMode());
        assertTrue(cfg.isMaxParticipantErrorsEnabled());
        assertEquals(5, cfg.getMaxParticipantErrors());
        assertEquals(5, cfg.getEffectiveMaxParticipantErrorsForLoadTestMode());
    }

    @Test
    void retryEnabledOnlyDisablesMaxParticipantErrors() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("LOADTEST_CONFIG", "config/retry-enabled-only-config.yaml");

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // Only advanced.retry.enabled explicitly configured -> maxParticipantErrors
        // stays disabled for NORMAL mode.
        assertTrue(cfg.isRetryMode());
        assertFalse(cfg.isMaxParticipantErrorsEnabled());
        assertEquals(-1, cfg.getMaxParticipantErrors());
        // LOADTEST mode still always enforces its own default regardless.
        assertEquals(1, cfg.getEffectiveMaxParticipantErrorsForLoadTestMode());
    }

    @Test
    void retryExplicitlyDisabledFallsBackToMaxParticipantErrorsDefault() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("LOADTEST_CONFIG", "config/retry-disabled-only-config.yaml");

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // Explicitly disabling retry without configuring maxParticipantErrors still
        // must leave one stop-on-error mechanism active.
        assertFalse(cfg.isRetryMode());
        assertTrue(cfg.isMaxParticipantErrorsEnabled());
        assertEquals(1, cfg.getMaxParticipantErrors());
    }

    @Test
    void bothRetryAndMaxParticipantErrorsExplicitAreRespectedAsConfigured() {
        MockEnvironment env = new MockEnvironment();
        env.setProperty("LOADTEST_CONFIG", "config/retry-and-max-participant-errors-config.yaml");

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        assertTrue(cfg.isRetryMode());
        assertEquals(3, cfg.getRetryTimes());
        assertTrue(cfg.isMaxParticipantErrorsEnabled());
        assertEquals(5, cfg.getMaxParticipantErrors());
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

    @Test
    void readsAwsConfigFromYaml() {
        MockEnvironment env = new MockEnvironment();
        // Load an alternate test YAML that contains AWS options
        env.setProperty("LOADTEST_CONFIG", "config/aws-config.yaml");

        TestLoadTestConfig cfg = new TestLoadTestConfig(env);

        // AWS properties come from config-aws.yaml
        assertEquals("test", cfg.getAwsAccessKey());
        assertEquals("secret", cfg.getAwsSecretAccessKey());
        assertEquals("ami-test", cfg.getWorkerAmiId());
        assertEquals("t3.large", cfg.getWorkerInstanceType());
        assertEquals("test-key-pair", cfg.getWorkerInstanceKeyPair());
        assertEquals("sg-test", cfg.getWorkerSecurityGroupId());
        assertEquals("us-east-1", cfg.getWorkerInstanceRegion());
        assertEquals("us-east-1a", cfg.getWorkerAvailabilityZone());
        assertEquals(1, cfg.getWorkersNumberAtTheBeginning());
        assertEquals(1, cfg.getWorkersRumpUp());
        assertFalse(cfg.isTerminateWorkers());
    }
}
