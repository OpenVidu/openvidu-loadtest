package io.openvidu.loadtest.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Calendar;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.Environment;
import org.mockito.Mockito;
import static org.mockito.ArgumentMatchers.any;

import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;

class DataIOTest {

    private Environment env;
    private ResultExporter resultExporter;

    @BeforeEach
    void setUp() {
        env = mock(Environment.class);
        resultExporter = mock(ResultExporter.class);
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

        DataIO dataIO = new DataIO(env, resultExporter);
        List<TestCase> cases = dataIO.getTestCasesFromJSON();

        assertEquals(1, cases.size(), "Should load one test case");
        TestCase tc = cases.get(0);
        assertEquals(Topology.NxN.getValue(), tc.getTopology().getValue());
        assertEquals(2, tc.getParticipants().size());
        assertEquals(30, tc.getFrameRate());
    }

    @Test
    void testExportResults_writesResultsFile(@TempDir Path tempDir) throws IOException {
        when(env.getProperty(eq("LOADTEST_CONFIG"), anyString())).thenReturn("nonexistent.yaml");

        // Mock ResultExporter to write into our temp directory and return its path
        when(resultExporter.export(any(), anyString())).thenAnswer(invocation -> {
            ResultReport r = invocation.getArgument(0);
            String fname = invocation.getArgument(1);
            Files.writeString(tempDir.resolve(fname), r.toString());
            return tempDir.resolve(fname).toString();
        });

        DataIO dataIO = new DataIO(env, resultExporter);

        // Prepare a minimal ResultReport with start/end times and some values
        ResultReport report = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(2)
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());
        dataIO.exportResults(report);

        Path resultFile = tempDir.resolve("results.txt");
        assertTrue(Files.exists(resultFile), "results.txt should be created in RESULTS_DIR");

        String content = Files.readString(resultFile);
        assertTrue(content.contains("Number of participants created: 5"), "Content should include participants count");
        Mockito.verify(resultExporter).export(report, "results.txt");
    }

}
