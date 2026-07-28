package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Calendar;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.utils.ResultExporter;

class ResultExporterTest {

    private ResultExporter resultExporter;

    @BeforeEach
    void setUp() {
        resultExporter = new ResultExporter();
    }

    @AfterEach
    void tearDown() {
        System.clearProperty("RESULTS_DIR");
    }

    private ResultReport report(int participants, String participantsPerSession) {
        Calendar startTime = Calendar.getInstance();
        Calendar endTime = (Calendar) startTime.clone();
        endTime.add(Calendar.SECOND, 30);
        return new ResultReport()
                .setTotalParticipants(participants)
                .setParticipantsPerSession(participantsPerSession)
                .setSessionTopology("ONE_SESSION_NXN")
                .setStopReason("Test finished")
                .setStartTime(startTime)
                .setEndTime(endTime);
    }

    @Test
    void writesTheReportToTheResultsDirectory(@TempDir Path tempDir) throws IOException {
        System.setProperty("RESULTS_DIR", tempDir.toString());

        String path = resultExporter.export(report(4, "4"), "results-run.txt");

        assertEquals(tempDir.resolve("results-run.txt").toString(), path);
        assertTrue(Files.readString(Path.of(path)).contains("Number of participants created: 4"));
    }

    @Test
    void keepsEveryScenarioOfARunInsteadOfOnlyTheLast(@TempDir Path tempDir) throws IOException {
        System.setProperty("RESULTS_DIR", tempDir.toString());

        // A test case with several `participants` entries runs one scenario per
        // entry, and they all report to the same file
        resultExporter.export(report(2, "2"), "results-run.txt");
        resultExporter.export(report(4, "4"), "results-run.txt");
        String path = resultExporter.export(report(6, "6"), "results-run.txt");

        String content = Files.readString(Path.of(path));
        assertTrue(content.contains("Number of participants created: 2"), content);
        assertTrue(content.contains("Number of participants created: 4"), content);
        assertTrue(content.contains("Number of participants created: 6"), content);
        assertEquals(3, content.split("Test Case Report", -1).length - 1,
                "one report section per scenario");
    }

    @Test
    void createsTheResultsDirectoryWhenMissing(@TempDir Path tempDir) throws IOException {
        Path nested = tempDir.resolve("nested/results");
        System.setProperty("RESULTS_DIR", nested.toString());

        resultExporter.export(report(2, "2"), "results-run.txt");

        assertTrue(Files.exists(nested.resolve("results-run.txt")));
    }
}
