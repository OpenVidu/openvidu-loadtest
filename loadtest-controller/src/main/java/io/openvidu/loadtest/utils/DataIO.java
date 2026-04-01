package io.openvidu.loadtest.utils;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;
import io.openvidu.loadtest.config.LoadTestConfig;
import org.springframework.beans.factory.annotation.Autowired;

@Component
public class DataIO {

    private static final Logger log = LoggerFactory.getLogger(DataIO.class);
    private static final String DEFAULT_CONFIG = "config/config.yaml";
    private static final String CONFIG_ENV_VAR = "LOADTEST_CONFIG";
    private static final String REPORT_FILE_RESULT = "results.txt";

    private final Environment environment;
    private final ResultExporter resultExporter;
    @Autowired
    private LoadTestConfig loadTestConfig;
    @Autowired
    private HtmlReportGenerator htmlReportGenerator;

    // Constructor for tests or explicit wiring
    public DataIO(Environment environment, ResultExporter resultExporter) {
        this.environment = environment;
        this.resultExporter = resultExporter;
    }

    @SuppressWarnings("unchecked")
    public List<TestCase> getTestCasesFromJSON() {
        String configPathStr = environment.getProperty(CONFIG_ENV_VAR, DEFAULT_CONFIG);
        Path configPath = Path.of(configPathStr);
        File configFile = configPath.toFile();

        Map<String, Object> config;
        List<Map<String, Object>> testCasesList;

        if (configFile.exists()) {
            try {
                ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
                config = mapper.readValue(configFile, Map.class);
                log.info("Loading test cases from: {}", configPath);
            } catch (IOException e) {
                log.error("Failed to parse config file: {}", configPath, e);
                return new ArrayList<>();
            }
        } else {
            try (InputStream is = getClass().getClassLoader().getResourceAsStream(configPath.toString())) {
                if (is == null) {
                    log.error("Config file not found at {} or in classpath", configPath);
                    return new ArrayList<>();
                }
                ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
                config = mapper.readValue(is, Map.class);
                log.info("Loading test cases from classpath: {}", configPath);
            } catch (IOException e) {
                log.error("Failed to parse config file from classpath: {}", configPath, e);
                return new ArrayList<>();
            }
        }

        testCasesList = (List<Map<String, Object>>) config.get("testcases");
        if (testCasesList == null || testCasesList.isEmpty()) {
            log.error("No test cases found in config file");
            return new ArrayList<>();
        }

        return convertMapListToTestCasesList(testCasesList);
    }

    public void exportResults(ResultReport result) {
        log.debug("exportResults called");
        List<String> reportOutput = loadTestConfig != null ? loadTestConfig.getReportOutput() : new ArrayList<>();
        log.debug("reportOutput = {}", reportOutput);
        if (reportOutput.contains("txt")) {
            try {
                this.resultExporter.export(result, REPORT_FILE_RESULT);
            } catch (IOException e) {
                log.error("Could not save results to file", e);
            }
        }
        if (reportOutput.contains("html")) {
            try {
                htmlReportGenerator.generateHtmlReport(result, "report.html");
            } catch (IOException e) {
                log.error("Could not save HTML report to file", e);
            }
        }
    }

    /**
     * Protected factory method to create a FileSystemResource. Overridable in
     * tests.
     */
    protected FileSystemResource createFileSystemResource(String resource) {
        return new FileSystemResource(resource);
    }

    private List<TestCase> convertMapListToTestCasesList(List<Map<String, Object>> testCasesList) {
        List<TestCase> testCaseList = new ArrayList<>();
        for (Map<String, Object> element : testCasesList) {
            testCaseList.add(parseTestCase(element));
        }
        return testCaseList;
    }

    private TestCase parseTestCase(Map<String, Object> element) {
        String topology = parseTopology(element);

        List<String> participants = parseParticipants(element);
        int sessions = parseSessions(element);
        int frameRate = parseFrameRate(element);
        Resolution resolution = parseResolution(element);
        OpenViduRecordingMode openviduRecordingMode = parseOpenViduRecordingMode(element);
        boolean headlessBrowser = parseHeadless(element);
        boolean browserRecording = parseBrowserRecording(element);
        boolean showBrowserVideoElements = parseShowBrowserVideoElements(element);
        Browser browser = parseBrowser(element);
        int startingParticipants = parseStartingParticipants(element);

        TestCase testCase = new TestCase(topology, participants, sessions, frameRate, resolution,
                openviduRecordingMode, headlessBrowser, browserRecording, showBrowserVideoElements, browser);
        testCase.setStartingParticipants(startingParticipants);
        return testCase;
    }

    private String parseTopology(Map<String, Object> element) {
        Object topologyObj = element.get("topology");
        if (topologyObj == null) {
            topologyObj = element.get("typology");
        }
        return topologyObj != null ? topologyObj.toString() : "";
    }

    private List<String> parseParticipants(Map<String, Object> element) {
        List<String> participants = new ArrayList<>();
        Object participantsObj = element.get("participants");
        if (participantsObj instanceof List) {
            for (Object p : (List<?>) participantsObj) {
                participants.add(p.toString());
            }
        }
        return participants;
    }

    private int parseSessions(Map<String, Object> element) {
        Object sessionsObj = element.get("sessions");
        String sessionsStr = sessionsObj != null ? sessionsObj.toString() : "1";
        return sessionsStr.equalsIgnoreCase("infinite") ? -1 : parseInt(sessionsStr);
    }

    private int parseFrameRate(Map<String, Object> element) {
        Object frameRateObj = element.get("frameRate");
        return frameRateObj != null ? parseInt(frameRateObj.toString()) : 30;
    }

    private Resolution parseResolution(Map<String, Object> element) {
        Object resolutionObj = element.get("resolution");
        if (resolutionObj == null) {
            return Resolution.MEDIUM;
        }
        String resStr = resolutionObj.toString();
        if (resStr.equalsIgnoreCase(Resolution.HIGH.getValue()) || resStr.equals("1280x720")) {
            return Resolution.HIGH;
        } else if (resStr.equalsIgnoreCase("1920x1080") || resStr.equalsIgnoreCase(Resolution.FULLHIGH.getValue())) {
            return Resolution.FULLHIGH;
        }
        return Resolution.MEDIUM;
    }

    private OpenViduRecordingMode parseOpenViduRecordingMode(Map<String, Object> element) {
        Object openviduRecordingModeObj = element.get("openviduRecordingMode");
        if (openviduRecordingModeObj == null || openviduRecordingModeObj.toString().isBlank()) {
            return OpenViduRecordingMode.NONE;
        }
        String modeStr = openviduRecordingModeObj.toString();
        if (modeStr.equalsIgnoreCase(OpenViduRecordingMode.COMPOSED.getValue())) {
            return OpenViduRecordingMode.COMPOSED;
        } else if (modeStr.equalsIgnoreCase(OpenViduRecordingMode.INDIVIDUAL.getValue())) {
            return OpenViduRecordingMode.INDIVIDUAL;
        }
        return OpenViduRecordingMode.NONE;
    }

    private boolean parseHeadless(Map<String, Object> element) {
        Object headlessObj = element.get("headless");
        return headlessObj instanceof Boolean headlessObjBool && headlessObjBool;
    }

    private boolean parseBrowserRecording(Map<String, Object> element) {
        Object recordingObj = element.get("recording");
        return recordingObj instanceof Boolean recordingObjBool && recordingObjBool;
    }

    private boolean parseShowBrowserVideoElements(Map<String, Object> element) {
        Object showBrowserObj = element.get("showBrowserVideoElements");
        return showBrowserObj instanceof Boolean showBrowserObjBool && showBrowserObjBool;
    }

    private Browser parseBrowser(Map<String, Object> element) {
        Object browserObj = element.get("browser");
        if (browserObj == null || browserObj.toString().isBlank()) {
            return Browser.CHROME;
        }
        String browserStr = browserObj.toString();
        if (browserStr.equalsIgnoreCase(Browser.CHROME.getValue())) {
            return Browser.CHROME;
        } else if (browserStr.equalsIgnoreCase(Browser.FIREFOX.getValue())) {
            return Browser.FIREFOX;
        } else if (browserStr.equalsIgnoreCase(Browser.EMULATED.getValue())) {
            return Browser.EMULATED;
        }
        log.warn("Browser {} not recognized. Defaulting to Chrome.", browserStr);
        return Browser.CHROME;
    }

    private int parseStartingParticipants(Map<String, Object> element) {
        Object startingParticipantsObj = element.get("startingParticipants");
        return startingParticipantsObj != null ? parseInt(startingParticipantsObj.toString()) : 0;
    }

    private int parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

}
