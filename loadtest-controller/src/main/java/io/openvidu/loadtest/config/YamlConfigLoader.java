package io.openvidu.loadtest.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import io.openvidu.loadtest.exceptions.ConfigLoadException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.lang.Nullable;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

public class YamlConfigLoader {

    private static final Logger log = LoggerFactory.getLogger(YamlConfigLoader.class);

    private static final String DEFAULT_CONFIG = "config/config.yaml";
    private static final String CONFIG_ENV_VAR = "LOADTEST_CONFIG";

    private final Environment environment;
    private final Map<String, Object> config;

    public YamlConfigLoader(Environment environment) {
        this.environment = environment;
        this.config = loadConfig();
    }

    private Map<String, Object> loadConfig() {
        String configPathStr = environment.getProperty(CONFIG_ENV_VAR, DEFAULT_CONFIG);

        Path configPath = Path.of(configPathStr);
        File configFile = configPath.toFile();

        Map<String, Object> yamlConfig = new HashMap<>();

        if (configFile.exists()) {
            try {
                ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
                yamlConfig = mapper.readValue(configFile, new TypeReference<Map<String, Object>>() {
                });
                log.info("Loaded configuration from: {}", configPath);
            } catch (IOException e) {
                throw new ConfigLoadException("Failed to load config file from filesystem path: " + configPath, e);
            }
        } else {
            log.warn("Config file not found at {}, attempting to load from classpath", configPath);
            try (InputStream is = getClass().getClassLoader().getResourceAsStream(configPath.toString())) {
                if (is != null) {
                    ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
                    yamlConfig = mapper.readValue(is, new TypeReference<Map<String, Object>>() {
                    });
                    log.info("Loaded configuration from classpath: {}", configPath);
                } else {
                    throw new ConfigLoadException("Config file not found: " + configPath);
                }
            } catch (IOException e) {
                throw new ConfigLoadException("Failed to load config file from classpath resource: " + configPath, e);
            }
        }

        return yamlConfig;
    }

    @SuppressWarnings("unchecked")
    private Object getNestedValue(String... keys) {
        Object current = config;
        for (String key : keys) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(key);
            } else {
                return null;
            }
        }
        return current;
    }

    @SuppressWarnings("unchecked")
    public <T> T get(String key) {
        String envValue = environment.getProperty(key);
        if (envValue != null && !envValue.isEmpty()) {
            return convertValue(envValue, (Class<T>) getExpectedType());
        }

        Object value = getNestedValue(key.split("\\."));
        return (T) value;
    }

    public String getString(String key) {
        String envValue = environment.getProperty(key);
        if (envValue != null && !envValue.isEmpty()) {
            return envValue;
        }

        Object value = getNestedValue(key.split("\\."));
        return value != null ? value.toString() : "";
    }

    public int getInt(String key) {
        String envValue = environment.getProperty(key);
        if (envValue != null && !envValue.isEmpty()) {
            return parseInt(envValue);
        }

        Object value = getNestedValue(key.split("\\."));
        if (value == null) {
            return -1;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return parseInt(value.toString());
    }

    public boolean getBoolean(String key) {
        Boolean result = getBooleanOrNull(key);
        return Boolean.TRUE.equals(result);
    }

    @Nullable
    public Boolean getBooleanOrNull(String key) {
        String envValue = environment.getProperty(key);
        if (envValue != null && !envValue.isEmpty()) {
            return parseBoolean(envValue);
        }

        Object value = getNestedValue(key.split("\\."));
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean boolValue) {
            return boolValue;
        }
        return parseBoolean(value.toString());
    }

    public double getDouble(String key) {
        String envValue = environment.getProperty(key);
        if (envValue != null && !envValue.isEmpty()) {
            return parseDouble(envValue);
        }

        Object value = getNestedValue(key.split("\\."));
        if (value == null) {
            return 0.0;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return parseDouble(value.toString());
    }

    @SuppressWarnings("unchecked")
    public <T> T getNested(String... keys) {
        String envKey = String.join(".", keys);
        String envValue = environment.getProperty(envKey);
        if (envValue != null && !envValue.isEmpty()) {
            return convertValue(envValue, (Class<T>) getExpectedType());
        }

        return (T) getNestedValue(keys);
    }

    public Map<String, Object> getConfig() {
        return config;
    }

    @SuppressWarnings("unchecked")
    public <T> T convertValue(String value, Class<T> type) {
        if (type == String.class) {
            return (T) value;
        } else if (type == Integer.class || type == int.class) {
            return (T) Integer.valueOf(parseInt(value));
        } else if (type == Boolean.class || type == boolean.class) {
            return (T) Boolean.valueOf(parseBoolean(value));
        } else if (type == Double.class || type == double.class) {
            return (T) Double.valueOf(parseDouble(value));
        }
        return (T) value;
    }

    private int parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            log.warn("Invalid integer value '{}', using default -1", value, e);
            return -1;
        }
    }

    private double parseDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            log.warn("Invalid double value '{}', using default 0.0", value, e);
            return 0.0;
        }
    }

    private boolean parseBoolean(String value) {
        return Boolean.parseBoolean(value);
    }

    private Class<?> getExpectedType() {
        return String.class;
    }
}
