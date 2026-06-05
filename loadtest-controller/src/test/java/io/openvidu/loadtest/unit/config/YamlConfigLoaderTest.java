package io.openvidu.loadtest.unit.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import io.openvidu.loadtest.config.YamlConfigLoader;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class YamlConfigLoaderTest {

    @Test
    void loadsConfigFromClasspathAndRespectsEnvironmentOverride() {
        MockEnvironment env = new MockEnvironment();

        // Use default classpath config (config/config.yaml)
        YamlConfigLoader loader = new YamlConfigLoader(env);

        assertEquals("devkey", loader.getString("platform.apiKey"));
        // `testcases` is a YAML list; verify first element's `sessions` value
        Object testcasesObj = loader.getConfig().get("testcases");
        assertNotNull(testcasesObj);
        assertTrue(testcasesObj instanceof List);
        List<?> testcases = (List<?>) testcasesObj;
        assertFalse(testcases.isEmpty());
        Object first = testcases.get(0);
        assertTrue(first instanceof Map);
        Map<?, ?> firstMap = (Map<?, ?>) first;
        Object sessions = firstMap.get("sessions");
        assertNotNull(sessions);
        if (sessions instanceof Number) {
            assertEquals(1, ((Number) sessions).intValue());
        } else {
            fail("sessions is not a number: " + sessions);
        }
        assertTrue(loader.getBoolean("distribution.manual"));

        // Environment override should take precedence
        env.setProperty("platform.url", "https://override-url.com");
        assertEquals("https://override-url.com", loader.getString("platform.url"));
    }

    @Test
    void nestedAccessAndMissingKeyDefaults() {
        MockEnvironment env = new MockEnvironment();
        YamlConfigLoader loader = new YamlConfigLoader(env);

        // nested get via getNested
        String apiKey = loader.getNested("platform", "apiKey");
        assertEquals("devkey", apiKey);

        // missing integer returns -1
        assertEquals(-1, loader.getInt("non.existing.int"));

        // missing double returns 0.0
        assertEquals(0.0, loader.getDouble("non.existing.double"));

        // missing boolean returns false for getBoolean and null for getBooleanOrNull
        assertFalse(loader.getBoolean("non.existing.boolean"));
        assertNull(loader.getBooleanOrNull("non.existing.boolean"));

        // environment override for apiKey
        env.setProperty("platform.apiKey", "envkey");
        assertEquals("envkey", loader.getString("platform.apiKey"));
    }
}
