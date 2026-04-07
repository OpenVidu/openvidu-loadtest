package io.openvidu.loadtest.utils;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;

import com.samskivert.mustache.Mustache;
import com.samskivert.mustache.Template;

import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.services.BrowserEmulatorClient.RetryAttempt;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;

@Component
public class HtmlReportGenerator {

    private static final Logger log = LoggerFactory.getLogger(HtmlReportGenerator.class);
    private static final String DATE_PATTERN = "yyyy-MM-dd HH:mm:ss";
    private static final String REPORT_TEMPLATE_PATH = "templates/report.mustache";
    private static final String KEY_METRIC = "metric";
    private static final String KEY_VALUE = "value";
    private static final String PERCENTAGE_FORMAT = "%.1f%%";
    private static final int PAGE_SIZE = 50;

    private final Template reportTemplate;

    public HtmlReportGenerator() {
        this.reportTemplate = loadTemplate();
    }

    public void generateHtmlReport(ResultReport result, String fileName) throws IOException {
        String resultsDir = System.getenv("RESULTS_DIR");
        log.debug("RESULTS_DIR env: {}", resultsDir);
        if (resultsDir == null || resultsDir.isBlank()) {
            resultsDir = System.getProperty("RESULTS_DIR");
            log.debug("RESULTS_DIR sysprop: {}", resultsDir);
        }
        String resultPath;

        if (resultsDir != null && !resultsDir.isBlank()) {
            File dir = new File(resultsDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            resultPath = new File(dir, fileName).getAbsolutePath();
        } else {
            resultPath = new FileSystemResource(fileName).getFile().getAbsolutePath();
        }

        log.debug("Writing HTML report to: {}", resultPath);
        try (FileWriter fw = new FileWriter(resultPath);
                BufferedWriter bw = new BufferedWriter(fw)) {
            bw.write(renderHtmlContent(result));
        }
        log.info("Saved HTML report in {}", resultPath);
    }

    private Template loadTemplate() {
        try (InputStream templateInputStream = new ClassPathResource(REPORT_TEMPLATE_PATH).getInputStream();
                Reader templateReader = new InputStreamReader(templateInputStream, StandardCharsets.UTF_8)) {
            return Mustache.compiler().compile(templateReader);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot load HTML report template: " + REPORT_TEMPLATE_PATH, e);
        }
    }

    private String renderHtmlContent(ResultReport result) {
        Map<String, Object> context = buildMultiReportContext(List.of(result));
        return reportTemplate.execute(context);
    }

    private List<Map<String, String>> buildSummaryRows(ResultReport result) {
        List<Map<String, String>> rows = new ArrayList<>();
        rows.add(stringRow(KEY_METRIC, "Test Duration", KEY_VALUE, getDuration(result)));
        rows.add(stringRow(KEY_METRIC, "Sessions Created", KEY_VALUE, String.valueOf(result.getNumSessionsCreated())));
        rows.add(
                stringRow(KEY_METRIC, "Sessions Completed", KEY_VALUE,
                        String.valueOf(result.getNumSessionsCompleted())));
        rows.add(stringRow(KEY_METRIC, "Total Participants", KEY_VALUE, String.valueOf(result.getTotalParticipants())));
        rows.add(stringRow(KEY_METRIC, "Workers Used", KEY_VALUE, String.valueOf(result.getWorkersUsed())));
        if (result.getUsersPerWorker() > 0) {
            rows.add(stringRow(KEY_METRIC, "Users per Worker", KEY_VALUE, String.valueOf(result.getUsersPerWorker())));
        }
        rows.add(stringRow(KEY_METRIC, "Stop Reason", KEY_VALUE, safeString(result.getStopReason())));
        return rows;
    }

    private List<Map<String, Object>> buildCpuRows(Map<String, Double> cpuAvg, Map<String, Double> cpuMax) {
        Map<String, Double> effectiveCpuAvg = cpuAvg != null ? cpuAvg : Map.of();
        Map<String, Double> effectiveCpuMax = cpuMax != null ? cpuMax : Map.of();
        if (effectiveCpuAvg.isEmpty()) {
            return List.of();
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map.Entry<String, Double> cpuEntry : effectiveCpuAvg.entrySet()) {
            String worker = cpuEntry.getKey();
            double avg = cpuEntry.getValue();
            double max = effectiveCpuMax.getOrDefault(worker, 0.0);
            String avgFormatted = String.format(PERCENTAGE_FORMAT, avg);
            String maxFormatted = String.format(PERCENTAGE_FORMAT, max);
            boolean isAllWorkers = worker != null && worker.contains("All Workers");
            rows.add(objectRow("worker", safeString(worker), "avgCpu", avgFormatted,
                    "maxCpu", maxFormatted, "avgCpuColor", getCpuColorClass(avg), "maxCpuColor", getCpuColorClass(max),
                    "isAllWorkers", isAllWorkers));
        }
        return rows;
    }

    private String getCpuColorClass(double cpu) {
        if (cpu < 50)
            return "low";
        if (cpu < 80)
            return "medium";
        return "high";
    }

    private List<Map<String, Object>> buildUserRows(ResultReport result) {
        Map<String, Calendar> userSuccessTimestamps = resolveUserSuccessTimestamps(result);
        if (userSuccessTimestamps.isEmpty()) {
            return List.of();
        }

        // Build a map of user-session -> role (PUBLISHER/SUBSCRIBER).
        // Prefer precomputed roles from the ResultReport if present, otherwise
        // fall back to participant responses.
        Map<String, String> roleByUser = new java.util.HashMap<>();
        if (result.getRoleByUser() != null) {
            roleByUser.putAll(result.getRoleByUser());
        }
        List<CreateParticipantResponse> participantResponses = result.getParticipantResponses() != null
                ? result.getParticipantResponses()
                : List.of();
        for (CreateParticipantResponse r : participantResponses) {
            if (r.getUserId() != null && r.getSessionId() != null) {
                String k = r.getUserId() + "-" + r.getSessionId();
                if (r.getRole() != null) {
                    roleByUser.putIfAbsent(k, r.getRole().getLabel());
                }
            }
        }

        Map<String, Integer> userRetryCounts = result.getUserRetryCounts() != null ? result.getUserRetryCounts()
                : Map.of();
        Map<String, List<RetryAttempt>> userRetryAttempts = result.getUserRetryAttempts() != null
                ? result.getUserRetryAttempts()
                : Map.of();
        List<UserRetryInfo> users = toSortedUserRetryInfoList(userSuccessTimestamps, userRetryCounts);

        List<Map<String, Object>> rows = new ArrayList<>();
        // Track existing detail IDs to avoid collisions when sanitizing keys
        Set<String> existingDetailIds = new java.util.HashSet<>();
        for (UserRetryInfo info : users) {
            String key = info.userId + "-" + info.sessionId;
            List<Map<String, String>> attempts = buildRetryAttemptRows(userRetryAttempts.getOrDefault(key, List.of()));
            // Create a stable HTML id based on the user-session key. Replace
            // non-alphanumeric chars with '-'
            String sanitizedKey = key.replaceAll("[^A-Za-z0-9_-]", "-");
            String baseId = "retry-details-" + sanitizedKey;
            String retryDetailId = baseId;
            int suffix = 0;
            // Ensure uniqueness if sanitization caused collisions
            while (existingDetailIds.contains(retryDetailId)) {
                suffix++;
                retryDetailId = baseId + "-" + suffix;
            }
            existingDetailIds.add(retryDetailId);
            String roleLabel = roleByUser.getOrDefault(key, "-");
            rows.add(objectRow("userId", info.userId, "sessionId", info.sessionId,
                    "type", roleLabel,
                    "joinDate", formatDate(info.joinDate),
                    "retries", info.retries,
                    "ifRetriesGreaterThanZero", info.retries > 0,
                    "hasRetryAttempts", !attempts.isEmpty(),
                    "retryDetailId", retryDetailId,
                    "retryAttempts", attempts));
        }
        return rows;
    }

    private List<Map<String, String>> buildRetryAttemptRows(List<RetryAttempt> retryAttempts) {
        if (retryAttempts == null || retryAttempts.isEmpty()) {
            return List.of();
        }

        List<Map<String, String>> rows = new ArrayList<>();
        for (RetryAttempt retryAttempt : retryAttempts) {
            rows.add(stringRow(
                    "attemptNumber", String.valueOf(retryAttempt.getAttemptNumber()),
                    "errorDate", formatDate(retryAttempt.getErrorTimestamp()),
                    "reconnectDate", formatDate(retryAttempt.getReconnectTimestamp())));
        }
        return rows;
    }

    private Map<String, Calendar> resolveUserSuccessTimestamps(ResultReport result) {
        Map<String, Calendar> userSuccessTimestamps = result.getUserSuccessTimestamps() != null
                ? result.getUserSuccessTimestamps()
                : Map.of();

        if (!userSuccessTimestamps.isEmpty()) {
            logUserSuccessTimestamps(userSuccessTimestamps);
            return userSuccessTimestamps;
        }

        if (result.getUserStartTimes() == null || result.getUserStartTimes().isEmpty()) {
            log.debug("User success timestamps count: 0");
            return userSuccessTimestamps;
        }

        Map<String, Calendar> computed = new TreeMap<>();
        for (Map.Entry<Calendar, List<String>> entry : result.getUserStartTimes().entrySet()) {
            Calendar timestamp = entry.getKey();
            List<String> sessionUser = entry.getValue();
            if (sessionUser.size() >= 2) {
                String sessionId = sessionUser.get(0);
                String userId = sessionUser.get(1);
                String key = userId + "-" + sessionId;
                computed.put(key, timestamp);
            }
        }
        log.warn("Computed userSuccessTimestamps from userStartTimes, size: {}", computed.size());
        logUserSuccessTimestamps(computed);
        return computed;
    }

    private void logUserSuccessTimestamps(Map<String, Calendar> userSuccessTimestamps) {
        log.debug("User success timestamps count: {}", userSuccessTimestamps.size());
        for (Map.Entry<String, Calendar> entry : userSuccessTimestamps.entrySet()) {
            log.debug("  key: {}", entry.getKey());
        }
    }

    private List<UserRetryInfo> toSortedUserRetryInfoList(Map<String, Calendar> userSuccessTimestamps,
            Map<String, Integer> userRetryCounts) {
        List<UserRetryInfo> users = new ArrayList<>();
        for (Map.Entry<String, Calendar> entry : userSuccessTimestamps.entrySet()) {
            String key = entry.getKey();
            Calendar joinDate = entry.getValue();
            int retries = userRetryCounts.getOrDefault(key, 0);
            String[] parts = key.split("-", 2);
            String userId = parts.length > 0 && !parts[0].isEmpty() ? parts[0] : "-";
            String sessionId = parts.length > 1 && !parts[1].isEmpty() ? parts[1] : "-";
            users.add(new UserRetryInfo(userId, sessionId, joinDate, retries));
        }

        users.sort((a, b) -> {
            int cmp = a.sessionId.compareTo(b.sessionId);
            if (cmp != 0) {
                return cmp;
            }
            cmp = a.userId.compareTo(b.userId);
            if (cmp != 0) {
                return cmp;
            }
            return Integer.compare(a.retries, b.retries);
        });
        return users;
    }

    private List<Map<String, String>> buildConfigurationRows(ResultReport result) {
        List<Map<String, String>> rows = new ArrayList<>();
        rows.add(stringRow(KEY_METRIC, "Session Topology", KEY_VALUE, safeString(result.getSessionTopology())));
        rows.add(stringRow(KEY_METRIC, "Participants per Session", KEY_VALUE,
                safeString(result.getParticipantsPerSession())));
        rows.add(stringRow(KEY_METRIC, "Browser Recording", KEY_VALUE, String.valueOf(result.isBrowserRecording())));
        String openviduRecording = safeString(result.getOpenviduRecording());
        if (!openviduRecording.contains("No recording set")) {
            rows.add(stringRow(KEY_METRIC, "OpenVidu Recording", KEY_VALUE, openviduRecording));
        }
        rows.add(stringRow(KEY_METRIC, "Users per Worker", KEY_VALUE, String.valueOf(result.getUsersPerWorker())));
        return rows;
    }

    private String getDuration(ResultReport result) {
        if (result.getStartTime() == null || result.getEndTime() == null) {
            return "-";
        }
        long diffInMillis = Math
                .abs(result.getEndTime().getTime().getTime() - result.getStartTime().getTime().getTime());
        long seconds = diffInMillis / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        seconds %= 60;
        minutes %= 60;
        return String.format("%dh %dm %ds", hours, minutes, seconds);
    }

    private String formatDate(Calendar value) {
        if (value == null) {
            return "-";
        }
        return new SimpleDateFormat(DATE_PATTERN).format(value.getTime());
    }

    private boolean isHttpUrl(String value) {
        return value != null && (value.startsWith("http://") || value.startsWith("https://"));
    }

    private String safeString(String text) {
        return text == null ? "" : text;
    }

    private Map<String, String> stringRow(String... keyValuePairs) {
        if (keyValuePairs.length % 2 != 0) {
            throw new IllegalArgumentException("keyValuePairs must contain key/value pairs");
        }

        Map<String, String> row = new LinkedHashMap<>();
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            row.put(keyValuePairs[i], safeString(keyValuePairs[i + 1]));
        }
        return row;
    }

    private Map<String, Object> objectRow(Object... keyValuePairs) {
        if (keyValuePairs.length % 2 != 0) {
            throw new IllegalArgumentException("keyValuePairs must contain key/value pairs");
        }

        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            row.put(String.valueOf(keyValuePairs[i]), keyValuePairs[i + 1]);
        }
        return row;
    }

    public void generateMultiReport(List<ResultReport> reports, String fileName) throws IOException {
        if (reports == null || reports.isEmpty()) {
            log.warn("No reports to generate");
            return;
        }
        String resultsDir = System.getenv("RESULTS_DIR");
        log.debug("RESULTS_DIR env: {}", resultsDir);
        if (resultsDir == null || resultsDir.isBlank()) {
            resultsDir = System.getProperty("RESULTS_DIR");
            log.debug("RESULTS_DIR sysprop: {}", resultsDir);
        }
        String resultPath;

        if (resultsDir != null && !resultsDir.isBlank()) {
            File dir = new File(resultsDir);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            resultPath = new File(dir, fileName).getAbsolutePath();
        } else {
            resultPath = new FileSystemResource(fileName).getFile().getAbsolutePath();
        }

        log.debug("Writing multi HTML report to: {}", resultPath);
        try (FileWriter fw = new FileWriter(resultPath);
                BufferedWriter bw = new BufferedWriter(fw)) {
            bw.write(renderMultiHtmlContent(reports));
        }
        log.info("Saved multi HTML report in {}", resultPath);
    }

    private String renderMultiHtmlContent(List<ResultReport> reports) {
        Map<String, Object> context = buildMultiReportContext(reports);
        return reportTemplate.execute(context);
    }

    private Map<String, Object> buildMultiReportContext(List<ResultReport> reports) {
        Map<String, Object> context = new HashMap<>();
        boolean hasMultipleTestCases = reports.size() > 1;
        context.put("hasMultipleTestCases", hasMultipleTestCases);

        List<Map<String, Object>> testCases = new ArrayList<>();
        List<Map<String, Object>> overviewRows = new ArrayList<>();

        int totalSessionsCreated = 0;
        int totalSessionsCompleted = 0;
        int totalParticipants = 0;
        long totalDurationMs = 0;

        for (int i = 0; i < reports.size(); i++) {
            ResultReport result = reports.get(i);
            int index = i + 1;

            Map<String, Object> singleContext = buildSingleTestCaseContext(result, index);
            testCases.add(singleContext);

            totalSessionsCreated += result.getNumSessionsCreated();
            totalSessionsCompleted += result.getNumSessionsCompleted();
            totalParticipants += result.getTotalParticipants();
            if (result.getStartTime() != null && result.getEndTime() != null) {
                totalDurationMs += Math
                        .abs(result.getEndTime().getTime().getTime() - result.getStartTime().getTime().getTime());
            }

            Map<String, Object> overviewRow = new LinkedHashMap<>();
            overviewRow.put("index", String.valueOf(index));
            overviewRow.put("name", singleContext.get("tabName").toString());
            overviewRow.put("label", singleContext.get("tabLabel").toString());
            overviewRow.put("topology", safeString(result.getSessionTopology()));
            overviewRow.put("participantsPerSession", safeString(result.getParticipantsPerSession()));
            overviewRow.put("sessionsCreated", String.valueOf(result.getNumSessionsCreated()));
            overviewRow.put("sessionsCompleted", String.valueOf(result.getNumSessionsCompleted()));
            overviewRow.put("totalParticipants", String.valueOf(result.getTotalParticipants()));
            overviewRow.put("workersUsed", String.valueOf(result.getWorkersUsed()));
            overviewRow.put("duration", getDuration(result));
            overviewRow.put("stopReason", safeString(result.getStopReason()));
            overviewRows.add(overviewRow);
        }

        context.put("testCases", testCases);
        context.put("overviewRows", overviewRows);
        context.put("overviewTotalSessionsCreated", totalSessionsCreated);
        context.put("overviewTotalSessionsCompleted", totalSessionsCompleted);
        context.put("overviewTotalParticipants", totalParticipants);

        long totalSeconds = totalDurationMs / 1000;
        long totalMinutes = totalSeconds / 60;
        long totalHours = totalMinutes / 60;
        totalSeconds %= 60;
        totalMinutes %= 60;
        context.put("overviewTotalDuration", String.format("%dh %dm %ds", totalHours, totalMinutes, totalSeconds));

        if (!hasMultipleTestCases) {
            context.putAll(buildSingleTestCaseContext(reports.get(0), 1));
        } else {
            ResultReport firstReport = reports.get(0);
            context.put("generatedAt", formatDate(firstReport.getStartTime()));
        }

        return context;
    }

    private Map<String, Object> buildSingleTestCaseContext(ResultReport result, int index) {
        Map<String, Object> ctx = new HashMap<>();

        ctx.put("index", index);
        ctx.put("tabName", "Test Case " + index);

        String topology = safeString(result.getSessionTopology());
        String participants = safeString(result.getParticipantsPerSession());
        String label = topology;
        if (!participants.isEmpty()) {
            label += " \u2014 " + participants + " participant" + (!"1".equals(participants) ? "s" : "");
        }
        ctx.put("tabLabel", label);

        String description = "";
        if (result.getStopReason() != null && !result.getStopReason().equals("Test finished")) {
            description = result.getStopReason();
        }
        ctx.put("tabDescription", description);

        ctx.put("generatedAt", formatDate(result.getStartTime()));
        ctx.put("testDuration", getDuration(result));
        ctx.put("numSessionsCreated", result.getNumSessionsCreated());
        ctx.put("numSessionsCompleted", result.getNumSessionsCompleted());
        ctx.put("totalParticipants", result.getTotalParticipants());
        ctx.put("workersUsed", result.getWorkersUsed());
        ctx.put("summaryRows", buildSummaryRows(result));
        ctx.put("configurationRows", buildConfigurationRows(result));

        List<Map<String, Object>> cpuRows = buildCpuRows(result.getWorkerCpuAvg(), result.getWorkerCpuMax());
        ctx.put("hasCpuRows", !cpuRows.isEmpty());
        ctx.put("cpuRows", cpuRows);

        List<Map<String, Object>> userRows = buildUserRows(result);
        ctx.put("hasUsers", !userRows.isEmpty());
        ctx.put("userRows", userRows);
        ctx.put("userCount", userRows.size());
        ctx.put("currentPage", 1);
        ctx.put("totalPages", Math.max(1, (int) Math.ceil((double) userRows.size() / PAGE_SIZE)));
        ctx.put("isLastPage", userRows.size() <= PAGE_SIZE);
        ctx.put("pageSize", PAGE_SIZE);

        String kibanaUrl = result.getKibanaUrl();
        boolean showKibana = kibanaUrl != null && !kibanaUrl.trim().isEmpty() && !kibanaUrl.contains("not found");
        ctx.put("kibanaUrl", safeString(kibanaUrl));
        ctx.put("kibanaAsLink", showKibana && isHttpUrl(kibanaUrl));
        ctx.put("kibanaAsText", showKibana && !isHttpUrl(kibanaUrl));

        return ctx;
    }

    private static class UserRetryInfo {
        private final String userId;
        private final String sessionId;
        private final Calendar joinDate;
        private final int retries;

        UserRetryInfo(String userId, String sessionId, Calendar joinDate, int retries) {
            this.userId = userId;
            this.sessionId = sessionId;
            this.joinDate = joinDate;
            this.retries = retries;
        }
    }
}
