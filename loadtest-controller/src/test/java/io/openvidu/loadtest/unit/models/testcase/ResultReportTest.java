package io.openvidu.loadtest.unit.models.testcase;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.ResultReport;

class ResultReportTest {

    private ResultReport resultReport;

    @BeforeEach
    void setUp() {
        resultReport = new ResultReport();
    }

    @Test
    void testDefaultValues() {
        assertEquals(0, resultReport.getTotalParticipants());
        assertEquals(0, resultReport.getNumSessionsCompleted());
        assertEquals(0, resultReport.getNumSessionsCreated());
        assertEquals(0, resultReport.getWorkersUsed());
        assertNull(resultReport.getSessionTopology());
        assertFalse(resultReport.isBrowserRecording());
        assertEquals("", resultReport.getOpenviduRecording());
        assertEquals("", resultReport.getParticipantsPerSession());
        assertFalse(resultReport.isManualParticipantAllocation());
        assertEquals(0, resultReport.getUsersPerWorker());
        assertEquals("", resultReport.getKibanaUrl());
        assertNull(resultReport.getStartTime());
        assertNull(resultReport.getEndTime());
        assertEquals("", resultReport.getS3BucketName());
        assertEquals("", resultReport.getStopReason());
        assertNotNull(resultReport.getErrorCounts());
        assertTrue(resultReport.getErrorCounts().isEmpty());
        assertNotNull(resultReport.getWorkerCpuAvg());
        assertTrue(resultReport.getWorkerCpuAvg().isEmpty());
        assertNotNull(resultReport.getWorkerCpuMax());
        assertTrue(resultReport.getWorkerCpuMax().isEmpty());
        assertNotNull(resultReport.getUserStartDelaysPercentiles());
        assertEquals(0, resultReport.getUserStartDelaysPercentiles().length);
        assertEquals(0, resultReport.getTotalRetries());
        assertEquals(0, resultReport.getSuccessfulRetries());
        assertEquals(0.0, resultReport.getRetrySuccessRate());
        assertEquals(0.0, resultReport.getAvgRetriesPerParticipant());
        assertEquals(0, resultReport.getMaxRetriesInSingleParticipant());
        assertNotNull(resultReport.getParticipantResponses());
        assertTrue(resultReport.getParticipantResponses().isEmpty());
        assertNotNull(resultReport.getStreamsPerWorker());
        assertTrue(resultReport.getStreamsPerWorker().isEmpty());
        assertNotNull(resultReport.getTimePerWorker());
        assertTrue(resultReport.getTimePerWorker().isEmpty());
        assertNotNull(resultReport.getTimePerRecordingWorker());
        assertTrue(resultReport.getTimePerRecordingWorker().isEmpty());
        assertNotNull(resultReport.getUserStartTimes());
        assertTrue(resultReport.getUserStartTimes().isEmpty());
    }

    @Test
    void testSetParticipantResponses_withEmptyList() {
        List<CreateParticipantResponse> responses = new ArrayList<>();
        resultReport.setParticipantResponses(responses);

        assertTrue(resultReport.getParticipantResponses().isEmpty());
        assertTrue(resultReport.getErrorCounts().isEmpty());
        assertTrue(resultReport.getWorkerCpuAvg().isEmpty());
        assertTrue(resultReport.getWorkerCpuMax().isEmpty());
        // User start delays percentiles should be empty because userStartTimes is empty
        assertEquals(0, resultReport.getUserStartDelaysPercentiles().length);
    }

    @Test
    void testSetParticipantResponses_withSuccessfulResponses() {
        List<CreateParticipantResponse> responses = new ArrayList<>();
        responses.add(new CreateParticipantResponse(true, "", "conn1", 10, 1, "User1", "Session1", 25.0, "worker1"));
        responses.add(new CreateParticipantResponse(true, "", "conn2", 20, 2, "User2", "Session1", 35.0, "worker1"));
        responses.add(new CreateParticipantResponse(true, "", "conn3", 30, 3, "User3", "Session2", 45.0, "worker2"));

        resultReport.setParticipantResponses(responses);

        assertEquals(3, resultReport.getParticipantResponses().size());
        assertTrue(resultReport.getErrorCounts().isEmpty());
        assertEquals(3, resultReport.getWorkerCpuAvg().size());
        assertEquals(30.0, resultReport.getWorkerCpuAvg().get("worker1"), 0.001);
        assertEquals(45.0, resultReport.getWorkerCpuAvg().get("worker2"), 0.001);
        assertEquals(35.0, resultReport.getWorkerCpuAvg().get("All Workers"), 0.001);
        assertEquals(35.0, resultReport.getWorkerCpuMax().get("worker1"), 0.001);
        assertEquals(45.0, resultReport.getWorkerCpuMax().get("worker2"), 0.001);
        assertEquals(45.0, resultReport.getWorkerCpuMax().get("All Workers"), 0.001);
    }

    @Test
    void testSetParticipantResponses_withFailedResponses() {
        List<CreateParticipantResponse> responses = new ArrayList<>();
        responses.add(new CreateParticipantResponse(false, "Connection refused", "conn1", -1, -1, "", "", 0, "worker1"));
        responses.add(new CreateParticipantResponse(false, "Connection refused", "conn2", -1, -1, "", "", 0, "worker1"));
        responses.add(new CreateParticipantResponse(false, "Timeout", "conn3", -1, -1, "", "", 0, "worker2"));

        resultReport.setParticipantResponses(responses);

        assertEquals(3, resultReport.getParticipantResponses().size());
        assertEquals(2, resultReport.getErrorCounts().size());
        assertEquals(2, resultReport.getErrorCounts().get("Connection refused"));
        assertEquals(1, resultReport.getErrorCounts().get("Timeout"));
        // CPU stats should be empty because no successful responses
        assertTrue(resultReport.getWorkerCpuAvg().isEmpty());
        assertTrue(resultReport.getWorkerCpuMax().isEmpty());
    }

    @Test
    void testSetParticipantResponses_mixedResponses() {
        List<CreateParticipantResponse> responses = new ArrayList<>();
        responses.add(new CreateParticipantResponse(true, "", "conn1", 10, 1, "User1", "Session1", 20.0, "worker1"));
        responses.add(new CreateParticipantResponse(false, "Timeout", "conn2", -1, -1, "", "", 0, "worker1"));
        responses.add(new CreateParticipantResponse(true, "", "conn3", 30, 3, "User2", "Session2", 40.0, "worker2"));

        resultReport.setParticipantResponses(responses);

        assertEquals(3, resultReport.getParticipantResponses().size());
        assertEquals(1, resultReport.getErrorCounts().size());
        assertEquals(1, resultReport.getErrorCounts().get("Timeout"));
        assertEquals(3, resultReport.getWorkerCpuAvg().size());
        assertEquals(20.0, resultReport.getWorkerCpuAvg().get("worker1"), 0.001);
        assertEquals(40.0, resultReport.getWorkerCpuAvg().get("worker2"), 0.001);
        assertEquals(30.0, resultReport.getWorkerCpuAvg().get("All Workers"), 0.001);
        assertEquals(20.0, resultReport.getWorkerCpuMax().get("worker1"), 0.001);
        assertEquals(40.0, resultReport.getWorkerCpuMax().get("worker2"), 0.001);
        assertEquals(40.0, resultReport.getWorkerCpuMax().get("All Workers"), 0.001);
    }

    @Test
    void testComputeAggregates_withUserStartTimes() {
        Calendar startTime = Calendar.getInstance();
        resultReport.setStartTime(startTime);

        Map<Calendar, List<String>> userStartTimes = new HashMap<>();
        // Add 5 user start times with delays of 100ms, 200ms, 300ms, 400ms, 500ms
        for (int i = 1; i <= 5; i++) {
            Calendar userStart = (Calendar) startTime.clone();
            userStart.add(Calendar.MILLISECOND, i * 100);
            List<String> sessionUser = new ArrayList<>();
            sessionUser.add("Session1");
            sessionUser.add("User" + i);
            userStartTimes.put(userStart, sessionUser);
        }
        resultReport.setUserStartTimes(userStartTimes);

        // Trigger computeAggregates by setting participant responses (empty)
        resultReport.setParticipantResponses(new ArrayList<>());

        double[] percentiles = resultReport.getUserStartDelaysPercentiles();
        assertEquals(4, percentiles.length);
        // Check that percentiles are in increasing order
        assertTrue(percentiles[0] <= percentiles[1]);
        assertTrue(percentiles[1] <= percentiles[2]);
        assertTrue(percentiles[2] <= percentiles[3]);
        // p50 should be around 300ms (median of 100,200,300,400,500)
        assertEquals(300.0, percentiles[0], 50.0);
    }

    @Test
    void testSetRetryStatistics() {
        resultReport.setRetryStatistics(10, 7);

        assertEquals(10, resultReport.getTotalRetries());
        assertEquals(7, resultReport.getSuccessfulRetries());
        assertEquals(0.7, resultReport.getRetrySuccessRate(), 0.001);
    }

    @Test
    void testSetRetryStatistics_zeroTotalRetries() {
        resultReport.setRetryStatistics(0, 0);

        assertEquals(0, resultReport.getTotalRetries());
        assertEquals(0, resultReport.getSuccessfulRetries());
        assertEquals(0.0, resultReport.getRetrySuccessRate());
    }

    @Test
    void testSetAvgRetriesPerParticipant() {
        resultReport.setAvgRetriesPerParticipant(2.5);
        assertEquals(2.5, resultReport.getAvgRetriesPerParticipant(), 0.001);
    }

    @Test
    void testSetMaxRetriesInSingleParticipant() {
        resultReport.setMaxRetriesInSingleParticipant(5);
        assertEquals(5, resultReport.getMaxRetriesInSingleParticipant());
    }

    @Test
    void testSetWorkerCpuStats() {
        Map<String, Double> avg = new HashMap<>();
        avg.put("worker1", 25.0);
        avg.put("worker2", 35.0);
        Map<String, Double> max = new HashMap<>();
        max.put("worker1", 50.0);
        max.put("worker2", 60.0);

        resultReport.setWorkerCpuStats(avg, max);

        assertEquals(2, resultReport.getWorkerCpuAvg().size());
        assertEquals(25.0, resultReport.getWorkerCpuAvg().get("worker1"), 0.001);
        assertEquals(35.0, resultReport.getWorkerCpuAvg().get("worker2"), 0.001);
        assertEquals(2, resultReport.getWorkerCpuMax().size());
        assertEquals(50.0, resultReport.getWorkerCpuMax().get("worker1"), 0.001);
        assertEquals(60.0, resultReport.getWorkerCpuMax().get("worker2"), 0.001);
    }

    @Test
    void testSetErrorCounts() {
        Map<String, Integer> errors = new HashMap<>();
        errors.put("Timeout", 5);
        errors.put("Connection refused", 3);

        resultReport.setErrorCounts(errors);

        assertEquals(2, resultReport.getErrorCounts().size());
        assertEquals(5, resultReport.getErrorCounts().get("Timeout"));
        assertEquals(3, resultReport.getErrorCounts().get("Connection refused"));
    }

    @Test
    void testGettersAndSetters() {
        Calendar startTime = Calendar.getInstance();
        Calendar endTime = Calendar.getInstance();
        endTime.add(Calendar.SECOND, 100);

        resultReport.setTotalParticipants(10)
                .setNumSessionsCompleted(2)
                .setNumSessionsCreated(3)
                .setWorkersUsed(1)
                .setSessionTopology("N:N")
                .setBrowserRecording(true)
                .setOpenviduRecording("COMPOSED")
                .setParticipantsPerSession("5")
                .setManualParticipantAllocation(true)
                .setUsersPerWorker(5)
                .setKibanaUrl("http://kibana")
                .setStartTime(startTime)
                .setEndTime(endTime)
                .setS3BucketName("bucket")
                .setStopReason("Test finished");

        assertEquals(10, resultReport.getTotalParticipants());
        assertEquals(2, resultReport.getNumSessionsCompleted());
        assertEquals(3, resultReport.getNumSessionsCreated());
        assertEquals(1, resultReport.getWorkersUsed());
        assertEquals("N:N", resultReport.getSessionTopology());
        assertTrue(resultReport.isBrowserRecording());
        assertEquals("COMPOSED", resultReport.getOpenviduRecording());
        assertEquals("5", resultReport.getParticipantsPerSession());
        assertTrue(resultReport.isManualParticipantAllocation());
        assertEquals(5, resultReport.getUsersPerWorker());
        assertEquals("http://kibana", resultReport.getKibanaUrl());
        assertEquals(startTime, resultReport.getStartTime());
        assertEquals(endTime, resultReport.getEndTime());
        assertEquals("bucket", resultReport.getS3BucketName());
        assertEquals("Test finished", resultReport.getStopReason());
    }

    @Test
    void testToString_includesBasicFields() {
        Calendar startTime = Calendar.getInstance();
        Calendar endTime = Calendar.getInstance();
        endTime.add(Calendar.SECOND, 60);

        resultReport.setTotalParticipants(5)
                .setNumSessionsCreated(2)
                .setNumSessionsCompleted(2)
                .setStartTime(startTime)
                .setEndTime(endTime)
                .setSessionTopology("N:N")
                .setStopReason("Test finished");

        String toString = resultReport.toString();
        assertTrue(toString.contains("Test Case Report"));
        assertTrue(toString.contains("Number of participants created: 5"));
        assertTrue(toString.contains("Number of sessions created: 2"));
        assertTrue(toString.contains("Number of sessions completed: 2"));
        assertTrue(toString.contains("Session topology: N:N"));
        assertTrue(toString.contains("Stop reason: Test finished"));
    }
}