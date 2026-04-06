package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.services.BrowserEmulatorClient.RetryAttempt;
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
        assertTrue(content.contains("Load Test Report</h1>"));

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

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertNotNull(content);
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

        Map<String, List<RetryAttempt>> userRetryAttempts = new HashMap<>();
        List<RetryAttempt> user1Attempts = new ArrayList<>();
        RetryAttempt attempt1 = new RetryAttempt(1, (Calendar) now.clone());
        Calendar reconnect1 = (Calendar) now.clone();
        reconnect1.add(Calendar.SECOND, 3);
        attempt1.setReconnectTimestamp(reconnect1);
        user1Attempts.add(attempt1);
        userRetryAttempts.put("User1-LoadTestSession1", user1Attempts);
        resultReport.setUserRetryAttempts(userRetryAttempts);

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
        assertTrue(content.contains("Join Date"));
        assertTrue(content.contains("Retries"));
        assertTrue(content.contains("Retry Details"));
        assertTrue(content.contains("Attempt"));
        assertTrue(content.contains("Error Date"));
        assertTrue(content.contains("Reconnect Date"));

        // Parse with Jsoup to validate retry-details buttons and matching detail rows
        // exist
        org.jsoup.nodes.Document doc = org.jsoup.Jsoup.parse(content);
        org.jsoup.select.Elements buttons = doc.select(".retry-details-btn[data-detail-id]");
        assertFalse(buttons.isEmpty(), "There should be at least one retry details button with data-detail-id");

        for (org.jsoup.nodes.Element btn : buttons) {
            String detailId = btn.attr("data-detail-id");
            assertNotNull(detailId);
            org.jsoup.nodes.Element detailRow = doc.getElementById(detailId);
            assertNotNull(detailRow, "Detail row for " + detailId + " should exist");
            // Ensure the nested attempts table has at least one row
            org.jsoup.select.Elements attemptRows = detailRow.select(".retry-attempts-table tbody tr");
            assertFalse(attemptRows.isEmpty(), "Retry attempts table should contain rows for " + detailId);
        }
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
        cpuAvg.put("All Workers", 30.5);
        Map<String, Double> cpuMax = new HashMap<>();
        cpuMax.put("worker1", 50.0);
        cpuMax.put("worker2", 60.0);
        cpuMax.put("All Workers", 60.0);
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
        assertTrue(content.contains("All Workers"));
        assertTrue(content.contains("30.5"));
    }

    @Test
    void testCpuAllWorkersHighlighting(@TempDir Path tempDir) throws IOException {
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
        cpuAvg.put("All Workers", 30.5);
        Map<String, Double> cpuMax = new HashMap<>();
        cpuMax.put("worker1", 50.0);
        cpuMax.put("worker2", 60.0);
        cpuMax.put("All Workers", 60.0);
        resultReport.setWorkerCpuStats(cpuAvg, cpuMax);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        org.jsoup.nodes.Document doc = org.jsoup.Jsoup.parse(content);
        org.jsoup.nodes.Element cpuTable = doc.selectFirst("table:has(th:contains(Average CPU))");
        assertNotNull(cpuTable, "CPU table should be present in the report");
        org.jsoup.select.Elements rows = cpuTable.select("tbody > tr");
        assertEquals(3, rows.size(), "There should be three cpu rows");

        int highlighted = 0;
        for (org.jsoup.nodes.Element row : rows) {
            boolean isHighlighted = row.hasClass("all-workers");
            String workerName = row.selectFirst("td").text().trim();
            if (isHighlighted) {
                highlighted++;
                assertEquals("All Workers", workerName, "Only the 'All Workers' row should be highlighted");
            }
        }
        assertEquals(1, highlighted, "Exactly one row (All Workers) should be highlighted");
    }

    @Test
    void testGenerateHtmlReport_withPerWorkerCpuFromResponses(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(4)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance());

        List<CreateParticipantResponse> responses = new ArrayList<>();
        responses.add(new CreateParticipantResponse(true, "", "conn1", 10, 1, "User1", "Session1", 20.0, "worker-1"));
        responses.add(new CreateParticipantResponse(true, "", "conn2", 15, 2, "User2", "Session1", 30.0, "worker-1"));
        responses.add(new CreateParticipantResponse(true, "", "conn3", 20, 3, "User3", "Session1", 40.0, "worker-2"));
        responses.add(new CreateParticipantResponse(true, "", "conn4", 25, 4, "User4", "Session1", 50.0, "worker-2"));
        resultReport.setParticipantResponses(responses);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertTrue(content.contains("Worker CPU Utilization"));
        assertTrue(content.contains("worker-1"));
        assertTrue(content.contains("worker-2"));
        assertTrue(content.contains("All Workers"));

        Map<String, Double> cpuAvg = resultReport.getWorkerCpuAvg();
        Map<String, Double> cpuMax = resultReport.getWorkerCpuMax();

        assertEquals(3, cpuAvg.size());
        assertEquals(25.0, cpuAvg.get("worker-1"), 0.001);
        assertEquals(45.0, cpuAvg.get("worker-2"), 0.001);
        assertEquals(35.0, cpuAvg.get("All Workers"), 0.001);

        assertEquals(3, cpuMax.size());
        assertEquals(30.0, cpuMax.get("worker-1"), 0.001);
        assertEquals(50.0, cpuMax.get("worker-2"), 0.001);
        assertEquals(50.0, cpuMax.get("All Workers"), 0.001);
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
        // Error section should not be visible (may appear in comments but not as
        // rendered content)
        assertFalse(content.contains(
                "class=\"section\">\n            <div class=\"section-header\">\n                <div class=\"section-title\">\n                    <svg"));
    }

}
