package io.openvidu.loadtest.utils;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;

import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;

@Service
public class DataIO {

    private static final Logger log = LoggerFactory.getLogger(DataIO.class);
    private static final String DEFAULT_CONFIG = "config/config.yaml";
    private static final String CONFIG_ENV_VAR = "LOADTEST_CONFIG";
    private static final String REPORT_FILE_RESULT = "results.txt";

    private final Environment environment;

    @Autowired
    public DataIO(Environment environment) {
        this.environment = environment;
    }

    @Autowired
    private JsonUtils jsonUtils;

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
        String resultsDir = System.getenv("RESULTS_DIR");
        String resultPath = null;
        try {
            if (resultsDir != null && !resultsDir.isBlank()) {
                File dir = new File(resultsDir);
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                resultPath = new File(dir, REPORT_FILE_RESULT).getAbsolutePath();
            } else {
                resultPath = new FileSystemResource(REPORT_FILE_RESULT).getFile().getAbsolutePath();
            }

            FileWriter fw = new FileWriter(resultPath, true);
            BufferedWriter bw = new BufferedWriter(fw);
            bw.write(result.toString());
            bw.newLine();
            bw.newLine();
            bw.close();
            log.info("Saved result in " + resultPath);
        } catch (IOException e) {
            e.printStackTrace();
            log.error("Could not save results to {}", resultPath);
        }
    }

    @SuppressWarnings("unchecked")
    private List<TestCase> convertMapListToTestCasesList(List<Map<String, Object>> testCasesList) {
        List<TestCase> testCaseList = new ArrayList<>();

        for (Map<String, Object> element : testCasesList) {
            boolean headlessBrowser = false;
            boolean browserRecording = false;
            boolean showBrowserVideoElements = true;
            String openviduRecordingModeStr = "";
            int frameRate = 30;
            Resolution resolution = Resolution.MEDIUM;
            List<String> participants = new ArrayList<>();
            int sessions = 0;
            OpenViduRecordingMode openviduRecordingMode = OpenViduRecordingMode.NONE;
            Browser browser = Browser.CHROME;

            Object topologyObj = element.get("topology");
            if (topologyObj == null) {
                topologyObj = element.get("typology");
            }
            String topology = topologyObj != null ? topologyObj.toString() : "";

            int startingParticipants = 0;

            if (!topology.equalsIgnoreCase(Topology.TERMINATE.getValue())) {
                Object sessionsObj = element.get("sessions");
                String sessionsStr = sessionsObj != null ? sessionsObj.toString() : "1";

                Object participantsObj = element.get("participants");
                if (participantsObj instanceof List) {
                    participants = new ArrayList<>();
                    for (Object p : (List<?>) participantsObj) {
                        participants.add(p.toString());
                    }
                }

                Object frameRateObj = element.get("frameRate");
                if (frameRateObj != null) {
                    frameRate = parseInt(frameRateObj.toString());
                }

                Object resolutionObj = element.get("resolution");
                if (resolutionObj != null) {
                    String resStr = resolutionObj.toString();
                    if (resStr.equalsIgnoreCase(Resolution.HIGH.getValue()) || resStr.equals("1280x720")) {
                        resolution = Resolution.HIGH;
                    } else if (resStr.equalsIgnoreCase("1920x1080") || resStr.equalsIgnoreCase(Resolution.FULLHIGH.getValue())) {
                        resolution = Resolution.FULLHIGH;
                    } else {
                        resolution = Resolution.MEDIUM;
                    }
                }

                Object openviduRecordingModeObj = element.get("openviduRecordingMode");
                if (openviduRecordingModeObj != null) {
                    openviduRecordingModeStr = openviduRecordingModeObj.toString();
                }

                Object startingParticipantsObj = element.get("startingParticipants");
                if (startingParticipantsObj != null) {
                    startingParticipants = parseInt(startingParticipantsObj.toString());
                }

                if (!openviduRecordingModeStr.isBlank()) {
                    if (openviduRecordingModeStr.equalsIgnoreCase(OpenViduRecordingMode.COMPOSED.getValue())) {
                        openviduRecordingMode = OpenViduRecordingMode.COMPOSED;
                    } else if (openviduRecordingModeStr.equalsIgnoreCase(OpenViduRecordingMode.INDIVIDUAL.getValue())) {
                        openviduRecordingMode = OpenViduRecordingMode.INDIVIDUAL;
                    }
                }

                sessions = sessionsStr.equalsIgnoreCase("infinite") ? -1 : parseInt(sessionsStr);

                Object recordingObj = element.get("recording");
                browserRecording = recordingObj instanceof Boolean ? (Boolean) recordingObj : false;

                Object headlessObj = element.get("headless");
                headlessBrowser = headlessObj instanceof Boolean ? (Boolean) headlessObj : false;

                Object showBrowserObj = element.get("showBrowserVideoElements");
                showBrowserVideoElements = showBrowserObj instanceof Boolean ? (Boolean) showBrowserObj : true;

                Object browserObj = element.get("browser");
                if (browserObj != null && !browserObj.toString().isBlank()) {
                    String browserStr = browserObj.toString();
                    if (browserStr.equalsIgnoreCase(Browser.CHROME.getValue())) {
                        browser = Browser.CHROME;
                    } else if (browserStr.equalsIgnoreCase(Browser.FIREFOX.getValue())) {
                        browser = Browser.FIREFOX;
                    } else {
                        log.warn("Browser {} not recognized. Defaulting to Chrome.", browserStr);
                    }
                }
            }

            TestCase testCase = new TestCase(topology, participants, sessions, frameRate, resolution,
                    openviduRecordingMode,
                    headlessBrowser, browserRecording, showBrowserVideoElements, browser);
            testCase.setStartingParticipants(startingParticipants);
            testCaseList.add(testCase);
        }

        return testCaseList;
    }

    private int parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public boolean askForConfirmation(String message) {
        log.warn(message);
        String confirmation;
        java.util.Scanner scanner = new java.util.Scanner(System.in);
        do {
            confirmation = scanner.nextLine();
            if (!confirmation.equalsIgnoreCase("Y") && !confirmation.equalsIgnoreCase("N")) {
                log.warn("Please answer with Y or N.");
            }
        } while (!confirmation.equalsIgnoreCase("Y") && !confirmation.equalsIgnoreCase("N"));
        return confirmation.equalsIgnoreCase("Y");
    }

}
