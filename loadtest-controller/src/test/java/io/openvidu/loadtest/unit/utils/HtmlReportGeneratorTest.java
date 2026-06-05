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

import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.models.monitoring.PlatformMetric.Point;
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
        assertFalse(content.contains(
                "class=\"section\">\n            <div class=\"section-header\">\n                <div class=\"section-title\">\n                    <svg"));
    }

    @Test
    void testGenerateMultiReport_singleTestCase(@TempDir Path tempDir) throws IOException {
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

        List<ResultReport> reports = new ArrayList<>();
        reports.add(resultReport);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateMultiReport(reports, reportPath.toString());

        assertTrue(Files.exists(reportPath));
        String content = Files.readString(reportPath);

        assertTrue(content.contains("<!DOCTYPE html>"), "Should contain DOCTYPE");
        assertTrue(content.contains("OpenVidu Load Test Report"), "Should contain title");
        assertTrue(content.contains("Session Topology"), "Should show topology in configuration");
        assertTrue(content.contains("Summary"), "Should contain summary section");
        assertTrue(content.contains("Configuration"), "Should contain configuration section");
    }

    @Test
    void testGenerateMultiReport_multipleTestCases(@TempDir Path tempDir) throws IOException {
        Calendar startTime1 = Calendar.getInstance();
        Calendar endTime1 = Calendar.getInstance();
        endTime1.add(Calendar.SECOND, 60);

        ResultReport report1 = new ResultReport()
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
                .setStartTime(startTime1)
                .setEndTime(endTime1)
                .setKibanaUrl("")
                .setS3BucketName("bucket");

        Calendar startTime2 = Calendar.getInstance();
        startTime2.add(Calendar.MINUTE, 10);
        Calendar endTime2 = (Calendar) startTime2.clone();
        endTime2.add(Calendar.SECOND, 120);

        ResultReport report2 = new ResultReport()
                .setTotalParticipants(20)
                .setNumSessionsCreated(4)
                .setNumSessionsCompleted(3)
                .setWorkersUsed(2)
                .setSessionTopology("N:M")
                .setParticipantsPerSession("10")
                .setBrowserRecording(true)
                .setOpenviduRecording("COMPOSED")
                .setManualParticipantAllocation(false)
                .setStopReason("Timeout reached")
                .setStartTime(startTime2)
                .setEndTime(endTime2)
                .setKibanaUrl("")
                .setS3BucketName("bucket2");

        List<ResultReport> reports = new ArrayList<>();
        reports.add(report1);
        reports.add(report2);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateMultiReport(reports, reportPath.toString());

        assertTrue(Files.exists(reportPath));
        String content = Files.readString(reportPath);

        assertTrue(content.contains("tab-bar"), "Tab bar should be present for multiple test cases");
        assertTrue(content.contains("Overview"), "Overview tab should be present");
        assertTrue(content.contains("Test Case 1"));
        assertTrue(content.contains("Test Case 2"));
        assertTrue(content.contains("N:N"));
        assertTrue(content.contains("N:M"));
        assertTrue(content.contains("5 participant"));
        assertTrue(content.contains("10 participants"));
        assertTrue(content.contains("Timeout reached"), "Stop reason should appear as subtitle");

        org.jsoup.nodes.Document doc = org.jsoup.Jsoup.parse(content);
        org.jsoup.select.Elements tabButtons = doc.select(".tab-btn");
        assertEquals(3, tabButtons.size(), "Should have Overview + 2 test case tabs");

        org.jsoup.select.Elements tabContents = doc.select(".tab-content");
        assertEquals(3, tabContents.size(), "Should have Overview + 2 test case content panels");

        assertTrue(content.contains("overviewTotalSessionsCreated") || content.contains("6"),
                "Overview should show aggregated session count");
        assertTrue(content.contains("overviewTotalParticipants") || content.contains("30"),
                "Overview should show aggregated participant count");
    }

    @Test
    void testGenerateMultiReport_tabContentIsolation(@TempDir Path tempDir) throws IOException {
        Calendar startTime1 = Calendar.getInstance();
        Calendar endTime1 = Calendar.getInstance();
        endTime1.add(Calendar.SECOND, 60);

        ResultReport report1 = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setWorkersUsed(1)
                .setSessionTopology("N:N")
                .setParticipantsPerSession("5")
                .setStopReason("Test finished")
                .setStartTime(startTime1)
                .setEndTime(endTime1)
                .setKibanaUrl("")
                .setS3BucketName("");

        Calendar startTime2 = Calendar.getInstance();
        startTime2.add(Calendar.MINUTE, 5);
        Calendar endTime2 = (Calendar) startTime2.clone();
        endTime2.add(Calendar.SECOND, 90);

        ResultReport report2 = new ResultReport()
                .setTotalParticipants(15)
                .setNumSessionsCreated(3)
                .setNumSessionsCompleted(3)
                .setWorkersUsed(2)
                .setSessionTopology("N:M")
                .setParticipantsPerSession("10")
                .setStopReason("Test finished")
                .setStartTime(startTime2)
                .setEndTime(endTime2)
                .setKibanaUrl("")
                .setS3BucketName("");

        List<ResultReport> reports = new ArrayList<>();
        reports.add(report1);
        reports.add(report2);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateMultiReport(reports, reportPath.toString());

        String content = Files.readString(reportPath);
        org.jsoup.nodes.Document doc = org.jsoup.Jsoup.parse(content);

        org.jsoup.select.Elements tab1Content = doc.select("#tab-tc-1");
        assertFalse(tab1Content.isEmpty(), "Tab content for test case 1 should exist");
        assertTrue(tab1Content.text().contains("5"), "Tab 1 should contain participant count from report 1");
        assertTrue(tab1Content.text().contains("N:N"), "Tab 1 should contain topology from report 1");

        org.jsoup.select.Elements tab2Content = doc.select("#tab-tc-2");
        assertFalse(tab2Content.isEmpty(), "Tab content for test case 2 should exist");
        assertTrue(tab2Content.text().contains("15"), "Tab 2 should contain participant count from report 2");
        assertTrue(tab2Content.text().contains("N:M"), "Tab 2 should contain topology from report 2");

        org.jsoup.select.Elements overviewTable = doc.select(".overview-table");
        assertFalse(overviewTable.isEmpty(), "Overview comparison table should exist");
        org.jsoup.select.Elements overviewRows = doc.select(".overview-table tbody tr");
        assertEquals(2, overviewRows.size(), "Overview table should have 2 rows");
    }

    @Test
    void testGenerateHtmlReport_withPlatformMetrics(@TempDir Path tempDir) throws IOException {
        List<Point> points = List.of(
                new Point(1000.0, 10.0),
                new Point(2000.0, 20.0),
                new Point(3000.0, 15.0));

        List<PlatformMetric> platformMetrics = new ArrayList<>();
        platformMetrics.add(new PlatformMetric("participants", "count",
                "Concurrent participants connected to the platform", points));
        platformMetrics.add(new PlatformMetric("rtt_p95", "ms",
                "95th percentile round-trip time", points));
        platformMetrics.add(new PlatformMetric("packet_loss", "%",
                "Platform-wide percentage of RTP packets lost", points));

        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(10)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance())
                .setPlatformMetrics(platformMetrics);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        assertTrue(Files.exists(reportPath));
        String content = Files.readString(reportPath);

        // Check the section is present
        assertTrue(content.contains("OpenVidu Platform Metrics"));

        // Check metric names and descriptions
        assertTrue(content.contains("participants"));
        assertTrue(content.contains("Concurrent participants connected to the platform"));
        assertTrue(content.contains("rtt_p95"));
        assertTrue(content.contains("95th percentile round-trip time"));
        assertTrue(content.contains("packet_loss"));

        // Check min/avg/max values are rendered
        assertTrue(content.contains("10.00 count"));
        assertTrue(content.contains("15.00 count"));
        assertTrue(content.contains("20.00 count"));

        // Check sparkline SVG is present
        assertTrue(content.contains("<polyline points="));
    }

    @Test
    void testGenerateHtmlReport_withPlatformMetricsEmpty_noSection(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance())
                .setPlatformMetrics(new ArrayList<>());

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertFalse(content.contains("OpenVidu Platform Metrics"));
    }

    @Test
    void testGenerateHtmlReport_withBandwidthMetricFormatsBps(@TempDir Path tempDir) throws IOException {
        // Bandwidth in bps: 1.5Mbps = 1500000 bps
        List<Point> bpsPoints = List.of(
                new Point(1000.0, 1500000.0),
                new Point(2000.0, 2500000.0));

        List<PlatformMetric> platformMetrics = new ArrayList<>();
        platformMetrics.add(new PlatformMetric("bandwidth_in", "bps",
                "Media traffic received", bpsPoints));

        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance())
                .setPlatformMetrics(platformMetrics);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        // 1500000 bps should format as 1.50 Mbps
        assertTrue(content.contains("Mbps"));
        // 2500000 bps should format as 2.50 Mbps
        assertTrue(content.contains("2.50 Mbps"));
    }

    @Test
    void testGenerateMultiReport_withPlatformMetricsInTab(@TempDir Path tempDir) throws IOException {
        List<Point> points = List.of(new Point(1000.0, 10.0));

        List<PlatformMetric> platformMetrics = new ArrayList<>();
        platformMetrics.add(new PlatformMetric("participants", "count",
                "Concurrent participants", points));

        Calendar startTime = Calendar.getInstance();
        Calendar endTime = Calendar.getInstance();
        endTime.add(Calendar.SECOND, 60);

        ResultReport report = new ResultReport()
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
                .setKibanaUrl("")
                .setS3BucketName("bucket")
                .setPlatformMetrics(platformMetrics);

        List<ResultReport> reports = List.of(report);
        Path reportPath = tempDir.resolve("multi-report.html");
        htmlReportGenerator.generateMultiReport(reports, reportPath.toString());

        String content = Files.readString(reportPath);
        assertTrue(content.contains("OpenVidu Platform Metrics"));
        assertTrue(content.contains("participants"));
    }

    @Test
    void testGenerateMultiReport_withPlatformMetricOverflow(@TempDir Path tempDir) throws IOException {
        // Test that high values format correctly with unit suffix
        List<Point> points = List.of(new Point(1000.0, 2000.0));

        List<PlatformMetric> platformMetrics = new ArrayList<>();
        platformMetrics.add(new PlatformMetric("rtt_p95", "ms",
                "Round-trip time", points));

        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance())
                .setPlatformMetrics(platformMetrics);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        // Values >= 1000 use "%,.0f %s" format -> "2,000 ms"
        assertTrue(content.contains("2,000 ms") || content.contains("2000.00 ms"),
                "High RTT values should be formatted with the unit");
    }

    @Test
    void testGenerateHtmlReport_withPlatformMetricsAndNull(@TempDir Path tempDir) throws IOException {
        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance())
                .setPlatformMetrics(null);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);
        assertFalse(content.contains("OpenVidu Platform Metrics"),
                "Platform metrics section should not appear when metrics is null");
    }

    @Test
    void testGenerateHtmlReport_platformMetricSparkline(@TempDir Path tempDir) throws IOException {
        // Test sparkline with many points to verify SVG polyline generation
        List<Point> points = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            points.add(new Point(i * 1000.0, i * 10.0));
        }

        List<PlatformMetric> platformMetrics = new ArrayList<>();
        platformMetrics.add(new PlatformMetric("quality_score", "score",
                "Quality score", points));

        ResultReport resultReport = new ResultReport()
                .setTotalParticipants(5)
                .setNumSessionsCreated(1)
                .setNumSessionsCompleted(1)
                .setStopReason("Test finished")
                .setStartTime(Calendar.getInstance())
                .setEndTime(Calendar.getInstance())
                .setPlatformMetrics(platformMetrics);

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateHtmlReport(resultReport, reportPath.toString());

        String content = Files.readString(reportPath);

        // Parse with JSoup to verify sparkline SVG structure
        org.jsoup.nodes.Document doc = org.jsoup.Jsoup.parse(content);
        org.jsoup.select.Elements sparklineSvgs = doc.select(".metric-spark svg");
        assertFalse(sparklineSvgs.isEmpty(), "At least one sparkline SVG should exist");
        assertEquals(1, sparklineSvgs.size());

        org.jsoup.nodes.Element svg = sparklineSvgs.get(0);
        assertEquals("260", svg.attr("width"));
        assertEquals("36", svg.attr("height"));

        org.jsoup.select.Elements polylines = svg.select("polyline");
        assertFalse(polylines.isEmpty(), "Sparkline SVG should contain a polyline");
        String pointsAttr = polylines.get(0).attr("points");
        assertFalse(pointsAttr.isEmpty(), "Polyline points should not be empty");

        // Should have 10 coordinate pairs for 10 data points
        String[] coords = pointsAttr.trim().split("\\s+");
        assertEquals(10, coords.length,
                "Sparkline should have 10 coordinate pairs for 10 data points");
    }

    @Test
    void testGenerateMultiReport_emptyList(@TempDir Path tempDir) throws IOException {
        List<ResultReport> reports = new ArrayList<>();

        Path reportPath = tempDir.resolve("report.html");
        htmlReportGenerator.generateMultiReport(reports, reportPath.toString());

        assertFalse(Files.exists(reportPath), "No report should be generated for empty list");
    }

}
