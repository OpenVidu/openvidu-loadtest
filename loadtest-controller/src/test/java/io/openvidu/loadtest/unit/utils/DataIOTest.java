package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.core.env.Environment;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;
import io.openvidu.loadtest.utils.DataIO;
import io.openvidu.loadtest.utils.HtmlReportGenerator;
import io.openvidu.loadtest.utils.ResultExporter;

class DataIOTest {

    @Mock
    private Environment env;
    @Mock
    private ResultExporter resultExporter;
    @Mock
    private LoadTestConfig loadTestConfig;
    @Mock
    private HtmlReportGenerator htmlReportGenerator;

    private DataIO dataIO;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        dataIO = new DataIO(env, resultExporter, loadTestConfig, htmlReportGenerator);
    }

    @Test
    void testGetTestCasesFromJSON_fromFile(@TempDir Path tempDir) throws IOException {
        String yaml = """
                testcases:
                  - topology: N:N
                    sessions: 2
                    participants:
                      - "2"
                      - "8"
                    frameRate: 30
                    resolution: 1280x720
                    startingParticipants: 1
                    recording: false
                    headless: false
                    showBrowserVideoElements: true
                    browser: chrome
                """;

        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, yaml);

        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());

        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        assertEquals(1, cases.size(), "Should load one test case");
        TestCase tc = cases.get(0);
        assertEquals(Topology.N_X_N.getValue(), tc.getTopology().getValue());
        assertEquals(2, tc.getParticipants().size());
        assertEquals(30, tc.getFrameRate());
    }

    @Test
    void testGetTestCasesFromJSON_emulatedBrowser(@TempDir Path tempDir) throws IOException {
        String yaml = """
                testcases:
                  - topology: N:N
                    sessions: 1
                    participants:
                      - "4"
                    browser: emulated
                """;

        Path cfg = tempDir.resolve("config.yaml");
        Files.writeString(cfg, yaml);

        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn(cfg.toString());

        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        assertEquals(1, cases.size(), "Should load one test case");
        TestCase tc = cases.get(0);
        assertEquals(Browser.EMULATED, tc.getBrowser(), "Browser should be emulated");
    }

    @Test
    void testExportResults_writesResultsFile(@TempDir Path tempDir) throws IOException {
        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn("nonexistent.yaml");
        when(loadTestConfig.getReportOutput()).thenReturn(Arrays.asList("txt")); // Only txt output

        // Mock ResultExporter to write into our temp directory and return its path
        when(resultExporter.export(any(), anyString())).thenAnswer(invocation -> {
            ResultReport r = invocation.getArgument(0);
            String fname = invocation.getArgument(1);
            Files.writeString(tempDir.resolve(fname), r.toString());
            return tempDir.resolve(fname).toString();
        });

        // Prepare a minimal ResultReport with start/end times and some values
        ResultReport report = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(2)
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());
        String timestamp = "2026-04-14_10-30-00";
        dataIO.exportResultsTxtOnly(report, timestamp);

        Path resultFile = tempDir.resolve("results-" + timestamp + ".txt");
        assertTrue(Files.exists(resultFile), "results.txt should be created in RESULTS_DIR");

        String content = Files.readString(resultFile);
        assertTrue(content.contains("Number of participants created: 5"), "Content should include participants count");
        verify(resultExporter).export(report, "results-2026-04-14_10-30-00.txt");
        verify(htmlReportGenerator, never()).generateHtmlReport(any(), anyString());
    }

    @Test
    void testExportResults_doesNotGenerateHtmlReportWhenDisabled(@TempDir Path tempDir) throws IOException {
        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn("nonexistent.yaml");
        when(loadTestConfig.getReportOutput()).thenReturn(Arrays.asList("txt"));

        when(resultExporter.export(any(), anyString())).thenReturn(tempDir.resolve("results-2026-04-14_10-30-00.txt").toString());

        ResultReport report = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(2)
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());
        String timestamp = "2026-04-14_10-30-00";
        dataIO.exportResultsTxtOnly(report, timestamp);

        verify(resultExporter).export(report, "results-2026-04-14_10-30-00.txt");
        verify(htmlReportGenerator, never()).generateHtmlReport(any(), anyString());
    }

}