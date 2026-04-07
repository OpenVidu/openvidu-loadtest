package io.openvidu.loadtest.models.testcase;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;
import java.util.LinkedHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.services.BrowserEmulatorClient.RetryAttempt;

public class ResultReport {

    private static Logger log = LoggerFactory.getLogger(ResultReport.class);

    private int totalParticipants = 0;
    private int numSessionsCompleted = 0;
    private int numSessionsCreated = 0;
    private int workersUsed = 0;
    private List<Integer> streamsPerWorker = new ArrayList<>();
    private List<Long> timePerWorker = new ArrayList<>();
    private List<Long> timePerRecordingWorker = new ArrayList<>();
    private String sessionTopology;
    private boolean browserRecording;
    private String openviduRecording = "";
    private String participantsPerSession = "";
    private String stopReason = "";
    private Calendar startTime;
    private Calendar endTime;
    private String kibanaUrl = "";
    private boolean isManualParticipantAllocation = false;
    private int usersPerWorker = 0;
    private String s3BucketName = "";
    private Map<Calendar, List<String>> userStartTimes = new TreeMap<>();

    // New aggregated fields
    private List<CreateParticipantResponse> participantResponses = new ArrayList<>();
    private int totalRetries = 0;
    private int successfulRetries = 0;
    private double retrySuccessRate = 0.0;
    private double avgRetriesPerParticipant = 0.0;
    private int maxRetriesInSingleParticipant = 0;
    private Map<String, Double> workerCpuAvg = new TreeMap<>();
    private Map<String, Double> workerCpuMax = new TreeMap<>();
    private Map<String, Integer> workerStreams = new TreeMap<>();
    private Map<String, Integer> workerParticipants = new TreeMap<>();
    private double[] userStartDelaysPercentiles = new double[0]; // p50, p90, p95, p99
    private Map<String, Calendar> userSuccessTimestamps = new TreeMap<>(); // key: "session-user"
    private Map<String, Integer> userRetryCounts = new TreeMap<>(); // key: "session-user"
    private Map<String, Calendar> userDisconnectTimestamps = new TreeMap<>(); // key: "session-user"
    private Map<String, List<RetryAttempt>> userRetryAttempts = new LinkedHashMap<>(); // key: "session-user"
    private Map<String, String> roleByUser = new TreeMap<>();

    public ResultReport() {
    }

    public ResultReport build() {
        return new ResultReport(this.totalParticipants, this.numSessionsCompleted, this.numSessionsCreated,
                this.workersUsed, this.streamsPerWorker, this.sessionTopology,
                this.openviduRecording, this.browserRecording, this.isManualParticipantAllocation,
                this.usersPerWorker, this.participantsPerSession, this.stopReason, this.startTime, this.endTime,
                this.kibanaUrl, this.s3BucketName, this.timePerWorker, this.timePerRecordingWorker,
                this.userStartTimes, this.participantResponses, this.totalRetries, this.successfulRetries,
                this.retrySuccessRate, this.avgRetriesPerParticipant, this.maxRetriesInSingleParticipant,
                this.workerCpuAvg, this.workerCpuMax, this.workerStreams, this.workerParticipants,
                this.userStartDelaysPercentiles, this.userDisconnectTimestamps,
                this.userSuccessTimestamps, this.userRetryCounts, this.userRetryAttempts, this.roleByUser);
    }

    public ResultReport setManualParticipantAllocation(boolean isManualParticipantAllocation) {
        this.isManualParticipantAllocation = isManualParticipantAllocation;
        return this;
    }

    public ResultReport setTotalParticipants(int totalParticipants) {
        this.totalParticipants = totalParticipants;
        return this;
    }

    public ResultReport setNumSessionsCompleted(int numSessionsCompleted) {
        this.numSessionsCompleted = numSessionsCompleted;
        return this;
    }

    public ResultReport setUsersPerWorker(int usersPerWorker) {
        this.usersPerWorker = usersPerWorker;
        return this;
    }

    public ResultReport setNumSessionsCreated(int numSessionsCreated) {
        this.numSessionsCreated = numSessionsCreated;
        return this;
    }

    public ResultReport setWorkersUsed(int workersUsed) {
        this.workersUsed = workersUsed;
        return this;
    }

    public ResultReport setS3BucketName(String s3BucketName) {
        this.s3BucketName = s3BucketName;
        return this;
    }

    public ResultReport setStreamsPerWorker(List<Integer> streamsPerWorker) {
        this.streamsPerWorker = streamsPerWorker;
        return this;
    }

    public ResultReport setSessionTopology(String sessionTopology) {
        this.sessionTopology = sessionTopology;
        return this;
    }

    public ResultReport setBrowserRecording(boolean browserRecording) {
        this.browserRecording = browserRecording;
        return this;
    }

    public ResultReport setOpenviduRecording(String openviduRecording) {
        this.openviduRecording = openviduRecording;
        return this;
    }

    public ResultReport setParticipantsPerSession(String participantsPerSession) {
        this.participantsPerSession = participantsPerSession;
        return this;
    }

    public ResultReport setStopReason(String stopReason) {
        this.stopReason = stopReason;
        return this;
    }

    public ResultReport setStartTime(Calendar startTime) {
        this.startTime = startTime;
        return this;
    }

    public ResultReport setEndTime(Calendar endTime) {
        this.endTime = endTime;
        return this;
    }

    public ResultReport setKibanaUrl(String kibanaUrl) {
        this.kibanaUrl = kibanaUrl;
        return this;
    }

    public ResultReport setTimePerWorker(List<Long> timePerWorker) {
        this.timePerWorker = timePerWorker;
        return this;
    }

    public ResultReport setTimePerRecordingWorker(List<Long> timePerRecordingWorker) {
        this.timePerRecordingWorker = timePerRecordingWorker;
        return this;
    }

    public ResultReport setUserStartTimes(Map<Calendar, List<String>> userStartTimes) {
        this.userStartTimes.putAll(userStartTimes);
        return this;
    }

    public ResultReport setParticipantResponses(List<CreateParticipantResponse> participantResponses) {
        this.participantResponses = participantResponses;
        computeAggregates();
        return this;
    }

    public ResultReport setRetryStatistics(int totalRetries, int successfulRetries) {
        this.totalRetries = totalRetries;
        this.successfulRetries = successfulRetries;
        if (totalRetries > 0) {
            this.retrySuccessRate = (double) successfulRetries / totalRetries;
        }
        return this;
    }

    public ResultReport setAvgRetriesPerParticipant(double avg) {
        this.avgRetriesPerParticipant = avg;
        return this;
    }

    public ResultReport setMaxRetriesInSingleParticipant(int max) {
        this.maxRetriesInSingleParticipant = max;
        return this;
    }

    public ResultReport setWorkerCpuStats(Map<String, Double> avg, Map<String, Double> max) {
        this.workerCpuAvg = avg;
        this.workerCpuMax = max;
        return this;
    }

    public ResultReport setWorkerStreams(Map<String, Integer> streams) {
        this.workerStreams = streams;
        return this;
    }

    public ResultReport setWorkerParticipants(Map<String, Integer> participants) {
        this.workerParticipants = participants;
        return this;
    }

    public ResultReport setUserStartDelaysPercentiles(double[] percentiles) {
        this.userStartDelaysPercentiles = percentiles;
        return this;
    }

    public ResultReport setUserSuccessTimestamps(Map<String, Calendar> userSuccessTimestamps) {
        log.debug("setUserSuccessTimestamps called with size {}", userSuccessTimestamps.size());
        this.userSuccessTimestamps = userSuccessTimestamps;
        return this;
    }

    public ResultReport setUserRetryCounts(Map<String, Integer> userRetryCounts) {
        this.userRetryCounts = userRetryCounts;
        return this;
    }

    public ResultReport setUserDisconnectTimestamps(Map<String, Calendar> userDisconnectTimestamps) {
        this.userDisconnectTimestamps = userDisconnectTimestamps;
        return this;
    }

    public ResultReport setUserRetryAttempts(Map<String, List<RetryAttempt>> userRetryAttempts) {
        this.userRetryAttempts = userRetryAttempts;
        return this;
    }

    public ResultReport setRoleByUser(Map<String, String> roleByUser) {
        this.roleByUser = roleByUser != null ? roleByUser : new TreeMap<>();
        return this;
    }

    public Map<String, String> getRoleByUser() {
        return roleByUser;
    }

    private void computeAggregates() {
        // Compute per-worker and global CPU stats
        Map<String, List<Double>> cpuPerWorker = new TreeMap<>();
        double cpuSum = 0;
        int cpuCount = 0;
        double cpuMax = 0;
        for (CreateParticipantResponse resp : participantResponses) {
            if (resp.isResponseOk()) {
                double cpu = resp.getWorkerCpuPct();
                cpuSum += cpu;
                cpuCount++;
                if (cpu > cpuMax)
                    cpuMax = cpu;
                String worker = resp.getWorkerUrl();
                if (worker == null || worker.isEmpty()) {
                    worker = "Unknown Worker";
                }
                cpuPerWorker.computeIfAbsent(worker, k -> new ArrayList<>()).add(cpu);
            }
        }
        if (cpuCount > 0) {
            Map<String, Double> avgMap = new TreeMap<>();
            Map<String, Double> maxMap = new TreeMap<>();
            // Add per-worker stats
            for (Map.Entry<String, List<Double>> entry : cpuPerWorker.entrySet()) {
                String worker = entry.getKey();
                List<Double> values = entry.getValue();
                double workerAvg = values.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
                double workerMax = values.stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
                avgMap.put(worker, workerAvg);
                maxMap.put(worker, workerMax);
            }
            // Add global "All Workers" stats
            avgMap.put("All Workers", cpuSum / cpuCount);
            maxMap.put("All Workers", cpuMax);
            workerCpuAvg = avgMap;
            workerCpuMax = maxMap;
        }
        // Compute user start delays percentiles (relative to test start)
        if (!userStartTimes.isEmpty() && startTime != null) {
            List<Long> delaysMs = new ArrayList<>();
            for (Calendar userStart : userStartTimes.keySet()) {
                long delay = userStart.getTime().getTime() - startTime.getTime().getTime();
                delaysMs.add(delay);
            }
            Collections.sort(delaysMs);
            userStartDelaysPercentiles = new double[4];
            userStartDelaysPercentiles[0] = getPercentile(delaysMs, 0.5);
            userStartDelaysPercentiles[1] = getPercentile(delaysMs, 0.9);
            userStartDelaysPercentiles[2] = getPercentile(delaysMs, 0.95);
            userStartDelaysPercentiles[3] = getPercentile(delaysMs, 0.99);
        }
    }

    private double getPercentile(List<Long> sorted, double percentile) {
        if (sorted.isEmpty())
            return 0.0;
        int index = (int) Math.ceil(percentile * sorted.size()) - 1;
        index = Math.max(0, Math.min(index, sorted.size() - 1));
        return sorted.get(index);
    }

    public Map<String, Double> getWorkerCpuAvg() {
        return workerCpuAvg;
    }

    public Map<String, Double> getWorkerCpuMax() {
        return workerCpuMax;
    }

    public double[] getUserStartDelaysPercentiles() {
        return userStartDelaysPercentiles;
    }

    public Map<String, Calendar> getUserSuccessTimestamps() {
        return userSuccessTimestamps;
    }

    public Map<String, Integer> getUserRetryCounts() {
        return userRetryCounts;
    }

    public Map<String, Calendar> getUserDisconnectTimestamps() {
        return userDisconnectTimestamps;
    }

    public Map<String, List<RetryAttempt>> getUserRetryAttempts() {
        return userRetryAttempts;
    }

    public int getTotalRetries() {
        return totalRetries;
    }

    public int getSuccessfulRetries() {
        return successfulRetries;
    }

    public double getRetrySuccessRate() {
        return retrySuccessRate;
    }

    public double getAvgRetriesPerParticipant() {
        return avgRetriesPerParticipant;
    }

    public int getMaxRetriesInSingleParticipant() {
        return maxRetriesInSingleParticipant;
    }

    public List<CreateParticipantResponse> getParticipantResponses() {
        return participantResponses;
    }

    private ResultReport(int totalParticipants, int numSessionsCompleted, int numSessionsCreated, int workersUsed,
            List<Integer> streamsPerWorker, String sessionTopology,
            String openviduRecording, boolean browserRecording, boolean manualParticipantsAllocation,
            int usersPerWorker, String participantsPerSession, String stopReason, Calendar startTime,
            Calendar endTime, String kibanaUrl, String s3BucketName, List<Long> timePerWorker,
            List<Long> timePerRecordingWorker, Map<Calendar, List<String>> userStartTimes,
            List<CreateParticipantResponse> participantResponses, int totalRetries, int successfulRetries,
            double retrySuccessRate, double avgRetriesPerParticipant, int maxRetriesInSingleParticipant,
            Map<String, Double> workerCpuAvg, Map<String, Double> workerCpuMax,
            Map<String, Integer> workerStreams, Map<String, Integer> workerParticipants,
            double[] userStartDelaysPercentiles, Map<String, Calendar> userDisconnectTimestamps,
            Map<String, Calendar> userSuccessTimestamps, Map<String, Integer> userRetryCounts,
            Map<String, List<RetryAttempt>> userRetryAttempts, Map<String, String> roleByUser) {
        this.totalParticipants = totalParticipants;
        this.numSessionsCompleted = numSessionsCompleted;
        this.numSessionsCreated = numSessionsCreated;
        this.workersUsed = workersUsed;
        this.streamsPerWorker = streamsPerWorker;
        this.sessionTopology = sessionTopology;
        this.openviduRecording = openviduRecording;
        this.browserRecording = browserRecording;
        this.isManualParticipantAllocation = manualParticipantsAllocation;
        this.usersPerWorker = usersPerWorker;
        this.participantsPerSession = participantsPerSession;
        this.stopReason = stopReason;
        this.startTime = startTime;
        this.endTime = endTime;
        this.kibanaUrl = kibanaUrl;
        this.s3BucketName = s3BucketName;
        this.timePerWorker = timePerWorker;
        this.timePerRecordingWorker = timePerRecordingWorker;
        this.userStartTimes = userStartTimes;
        this.participantResponses = participantResponses;
        this.totalRetries = totalRetries;
        this.successfulRetries = successfulRetries;
        this.retrySuccessRate = retrySuccessRate;
        this.avgRetriesPerParticipant = avgRetriesPerParticipant;
        this.maxRetriesInSingleParticipant = maxRetriesInSingleParticipant;
        this.workerCpuAvg = workerCpuAvg;
        this.workerCpuMax = workerCpuMax;
        this.workerStreams = workerStreams;
        this.workerParticipants = workerParticipants;
        this.userStartDelaysPercentiles = userStartDelaysPercentiles;
        this.userDisconnectTimestamps = userDisconnectTimestamps;
        this.userSuccessTimestamps = userSuccessTimestamps;
        this.userRetryCounts = userRetryCounts;
        this.userRetryAttempts = userRetryAttempts;
        this.roleByUser = roleByUser != null ? roleByUser : new TreeMap<>();
    }

    private String getDuration() {
        int hours = 0;
        int minutes = 0;
        long diffInMillies = Math.abs(startTime.getTime().getTime() - endTime.getTime().getTime());
        int seconds = (int) TimeUnit.SECONDS.convert(diffInMillies, TimeUnit.MILLISECONDS);
        if (seconds >= 60) {
            minutes = (int) Math.floor(seconds / 60);
            seconds = seconds - (minutes * 60);
        }
        if (minutes >= 60) {
            hours = (int) Math.floor(minutes / 60);
            minutes = minutes - (hours * 60);
        }
        return hours + "h " + minutes + "m " + seconds + "s ";
    }

    private String getUserStartTime() {
        StringBuilder sb = new StringBuilder();
        sb.append("\n");
        for (Calendar key : userStartTimes.keySet()) {
            List<String> userSession = userStartTimes.get(key);
            String session = userSession.get(0);
            String user = userSession.get(1);
            sb.append(key.getTime().toString())
                    .append(" | ")
                    .append(session)
                    .append(" | ")
                    .append(user)
                    .append("\n");
        }
        return sb.toString();
    }

    public String getStopReason() {
        return stopReason;
    }

    public List<Integer> getStreamsPerWorker() {
        return streamsPerWorker;
    }

    public List<Long> getTimePerWorker() {
        return timePerWorker;
    }

    public List<Long> getTimePerRecordingWorker() {
        return timePerRecordingWorker;
    }

    public Map<Calendar, List<String>> getUserStartTimes() {
        return userStartTimes;
    }

    // Getters for existing fields
    public int getTotalParticipants() {
        return totalParticipants;
    }

    public int getNumSessionsCompleted() {
        return numSessionsCompleted;
    }

    public int getNumSessionsCreated() {
        return numSessionsCreated;
    }

    public int getWorkersUsed() {
        return workersUsed;
    }

    public String getSessionTopology() {
        return sessionTopology;
    }

    public boolean isBrowserRecording() {
        return browserRecording;
    }

    public String getOpenviduRecording() {
        return openviduRecording;
    }

    public String getParticipantsPerSession() {
        return participantsPerSession;
    }

    public boolean isManualParticipantAllocation() {
        return isManualParticipantAllocation;
    }

    public int getUsersPerWorker() {
        return usersPerWorker;
    }

    public String getKibanaUrl() {
        return kibanaUrl;
    }

    public Calendar getStartTime() {
        return startTime;
    }

    public Calendar getEndTime() {
        return endTime;
    }

    public String getS3BucketName() {
        return s3BucketName;
    }

    @Override
    public String toString() {
        String lineSeparator = System.getProperty("line.separator");
        return " ----- Test Case Report " + startTime.getTime() + " ----- " + lineSeparator
                + "Browser with recording: " + browserRecording + lineSeparator
                + "OpenVidu recording: " + openviduRecording + lineSeparator
                + "Session topology: " + sessionTopology + lineSeparator
                + "Participants per session: " + participantsPerSession + lineSeparator
                + "Number of sessions created: " + numSessionsCreated + lineSeparator
                + "Number of sessions completed: " + numSessionsCompleted + lineSeparator
                + "Number of participants created: " + totalParticipants + lineSeparator
                + "Number of workers used: " + workersUsed + lineSeparator
                + "Is manual participants allocation: " + isManualParticipantAllocation
                + lineSeparator
                + (isManualParticipantAllocation
                        ? "Number of users per worker: " + usersPerWorker + lineSeparator
                        : "")
                + (isManualParticipantAllocation ? ""
                        : "Number of streams per worker: " + streamsPerWorker + lineSeparator)
                + "Stop reason: " + stopReason + lineSeparator
                + (timePerWorker.isEmpty() ? ""
                        : "Time each worker has been alive (minutes): " + timePerWorker + lineSeparator)
                + (timePerRecordingWorker.isEmpty() ? ""
                        : "Time each worker has been alive (minutes, recording workers): " + timePerRecordingWorker
                                + lineSeparator)
                + "Test duration: " + getDuration() + lineSeparator + "Kibana url: " + kibanaUrl
                + lineSeparator + "Video quality control and stats: " + s3BucketName
                + lineSeparator
                + (userStartTimes.isEmpty() ? "" : "User start times: " + getUserStartTime() + lineSeparator)
                + lineSeparator
                + "   ---------------------   ";
    }

}
