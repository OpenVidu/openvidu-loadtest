package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.utils.HtmlReportGenerator;

class HtmlReportGeneratorTest {

    private HtmlReportGenerator htmlReportGenerator;

    @BeforeEach
    void setUp() {
        htmlReportGenerator = new HtmlReportGenerator();
    }

    @Test
    void testGenerateHtmlReport_basicContent(@TempDir Path tempDir) throws IOException {
        Calendar startTime = Calendar.getInstance();
        Calendar endTime = Calendar.getInstance();
        endTime.add(Calendar.SECOND, 100);

        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(10)
                .setNumSessionsCreated(2)
                .setNumSessionsCompleted(2)
                .setWorkersUsed(1)
                .setSessionTopology("N:N")
                .setParticipantsPerSession("5")
                .setBrowserRecording(false)
                .setOpenviduRecording("NONE")
                .setManualParticipantAllocation(false)
                .setStopReason("Test finished")
                .setStartTime(startTime)
                .setEndTime(endTime)
                .setKibanaUrl("http://kibana.example.com")
                .setS3BucketName("bucket");

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        assertTrue(Files.exists(reportPath));
        String content = Files.readString(reportPath);

        // Check basic HTML structure
        assertTrue(content.contains("<!DOCTYPE html>"));
        assertTrue(content.contains("<title>OpenVidu Load Test Report</title>"));
        assertTrue(content.contains("<h1>OpenVidu Load Test Report</h1>"));

        // Check summary table
        assertTrue(content.contains("Test Duration"));
        assertTrue(content.contains("Sessions Created"));
        assertTrue(content.contains("2"));
        assertTrue(content.contains("Sessions Completed"));
        assertTrue(content.contains("Total Participants"));
        assertTrue(content.contains("10"));
        assertTrue(content.contains("Workers Used"));
        assertTrue(content.contains("Stop Reason"));
        assertTrue(content.contains("Test finished"));

        // Check configuration section
        assertTrue(content.contains("Configuration"));
        assertTrue(content.contains("Session Topology"));
        assertTrue(content.contains("N:N"));
        assertTrue(content.contains("Participants per Session"));
        assertTrue(content.contains("5"));
        assertTrue(content.contains("Browser Recording"));
        assertTrue(content.contains("false"));
        assertTrue(content.contains("OpenVidu Recording"));
        assertTrue(content.contains("NONE"));
        assertTrue(content.contains("Manual Participant Allocation"));
        assertTrue(content.contains("false"));
        assertTrue(content.contains("Kibana Dashboard"));
        assertTrue(content.contains("http://kibana.example.com"));
    }

    @Test
    void testGenerateHtmlReport_withErrorCounts(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());

        Map<String, Integer> errorCounts = new HashMap<>();
        errorCounts.put("Connection refused", 3);
        errorCounts.put("Timeout", 2);
        resultReport.setErrorCounts(errorCounts);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertTrue(content.contains("Error Categorization"));
        assertTrue(content.contains("Connection refused"));
        assertTrue(content.contains("3"));
        assertTrue(content.contains("Timeout"));
        assertTrue(content.contains("2"));
    }



    @Test
    void testGenerateHtmlReport_withUserRetryDetails(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());

        Map<String, Calendar> userSuccessTimestamps = new HashMap<>();
        Calendar now = Calendar.getInstance();
        userSuccessTimestamps.put("User1-LoadTestSession1", now);
        Calendar earlier = (Calendar) now.clone();
        earlier.add(Calendar.MINUTE, -5);
        userSuccessTimestamps.put("User2-LoadTestSession1", earlier);
        resultReport.setUserSuccessTimestamps(userSuccessTimestamps);

        Map<String, Calendar> userDisconnectTimestamps = new HashMap<>();
        Calendar later = (Calendar) now.clone();
        later.add(Calendar.MINUTE, 10);
        userDisconnectTimestamps.put("User1-LoadTestSession1", later);
        Calendar later2 = (Calendar) earlier.clone();
        later2.add(Calendar.MINUTE, 10);
        userDisconnectTimestamps.put("User2-LoadTestSession1", later2);
        resultReport.setUserDisconnectTimestamps(userDisconnectTimestamps);

        Map<String, Integer> userRetryCounts = new HashMap<>();
        userRetryCounts.put("User1-LoadTestSession1", 2);
        userRetryCounts.put("User2-LoadTestSession1", 0);
        resultReport.setUserRetryCounts(userRetryCounts);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertTrue(content.contains("User Connections"));
        assertTrue(content.contains("User1"));
        assertTrue(content.contains("LoadTestSession1"));
        assertTrue(content.contains("2"));
        assertTrue(content.contains("User2"));
        assertTrue(content.contains("0"));
        // Check new columns
        assertTrue(content.contains("Join date"));
        assertTrue(content.contains("Disconnect Date"));
        assertTrue(content.contains("Retry Number"));
    }

    @Test
    void testGenerateHtmlReport_withWorkerCpu(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());

        Map<String, Double> cpuAvg = new HashMap<>();
        cpuAvg.put("worker1", 25.5);
        cpuAvg.put("worker2", 35.5);
        Map<String, Double> cpuMax = new HashMap<>();
        cpuMax.put("worker1", 50.0);
        cpuMax.put("worker2", 60.0);
        resultReport.setWorkerCpuStats(cpuAvg, cpuMax);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertTrue(content.contains("Worker CPU Utilization"));
        assertTrue(content.contains("worker1"));
        assertTrue(content.contains("25.5"));
        assertTrue(content.contains("50.0"));
        assertTrue(content.contains("worker2"));
        assertTrue(content.contains("35.5"));
        assertTrue(content.contains("60.0"));
    }

    @Test
    void testGenerateHtmlReport_noRetryStatisticsWhenZero(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());

        // Default retry statistics are zero
        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertFalse(content.contains("Retry Statistics"));
    }

    @Test
    void testGenerateHtmlReport_noErrorCountsWhenEmpty(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertFalse(content.contains("Error Categorization"));
    }

}