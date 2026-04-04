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
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;

import com.samskivert.mustache.Mustache;
import com.samskivert.mustache.Template;

import io.openvidu.loadtest.models.testcase.ResultReport;

@Component
public class HtmlReportGenerator {

    private static final Logger log = LoggerFactory.getLogger(HtmlReportGenerator.class);
    private static final String DATE_PATTERN = "yyyy-MM-dd HH:mm:ss";
    private static final String REPORT_TEMPLATE_PATH = "templates/report.mustache";
    private static final String KEY_METRIC = "metric";
    private static final String KEY_VALUE = "value";
    private static final String PERCENTAGE_FORMAT = "%.1f%%";

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
        Map<String, Object> context = buildTemplateContext(result);
        return reportTemplate.execute(context);
    }

    private Map<String, Object> buildTemplateContext(ResultReport result) {
        Map<String, Object> context = new HashMap<>();
        context.put("generatedAt", formatDate(result.getStartTime()));
        context.put("summaryRows", buildSummaryRows(result));

        List<Map<String, String>> errorRows = buildErrorRows(result.getErrorCounts());
        context.put("hasErrorRows", !errorRows.isEmpty());
        context.put("errorRows", errorRows);

        List<Map<String, String>> cpuRows = buildCpuRows(result.getWorkerCpuAvg(), result.getWorkerCpuMax());
        context.put("hasCpuRows", !cpuRows.isEmpty());
        context.put("cpuRows", cpuRows);

        context.put("userRows", buildUserRows(result));
        context.put("configurationRows", buildConfigurationRows(result));

        String kibanaUrl = result.getKibanaUrl();
        boolean showKibana = kibanaUrl != null && !kibanaUrl.trim().isEmpty() && !kibanaUrl.contains("not found");
        context.put("kibanaUrl", safeString(kibanaUrl));
        context.put("kibanaAsLink", showKibana && isHttpUrl(kibanaUrl));
        context.put("kibanaAsText", showKibana && !isHttpUrl(kibanaUrl));

        return context;
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
        rows.add(stringRow(KEY_METRIC, "Stop Reason", KEY_VALUE, safeString(result.getStopReason())));
        return rows;
    }

    private List<Map<String, String>> buildErrorRows(Map<String, Integer> errorCounts) {
        Map<String, Integer> effectiveErrorCounts = errorCounts != null ? errorCounts : Map.of();
        if (effectiveErrorCounts.isEmpty()) {
            return List.of();
        }

        int totalErrors = effectiveErrorCounts.values().stream().mapToInt(Integer::intValue).sum();
        List<Map<String, String>> rows = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : effectiveErrorCounts.entrySet()) {
            double percentage = totalErrors > 0 ? (double) entry.getValue() / totalErrors * 100 : 0.0;
            rows.add(stringRow("reason", safeString(entry.getKey()), "count", String.valueOf(entry.getValue()),
                    "percentage", String.format(PERCENTAGE_FORMAT, percentage)));
        }
        return rows;
    }

    private List<Map<String, String>> buildCpuRows(Map<String, Double> cpuAvg, Map<String, Double> cpuMax) {
        Map<String, Double> effectiveCpuAvg = cpuAvg != null ? cpuAvg : Map.of();
        Map<String, Double> effectiveCpuMax = cpuMax != null ? cpuMax : Map.of();
        if (effectiveCpuAvg.isEmpty()) {
            return List.of();
        }

        List<Map<String, String>> rows = new ArrayList<>();
        for (Map.Entry<String, Double> cpuEntry : effectiveCpuAvg.entrySet()) {
            String worker = cpuEntry.getKey();
            double avg = cpuEntry.getValue();
            double max = effectiveCpuMax.getOrDefault(worker, 0.0);
            rows.add(stringRow("worker", safeString(worker), "avgCpu", String.format(PERCENTAGE_FORMAT, avg),
                    "maxCpu", String.format(PERCENTAGE_FORMAT, max)));
        }
        return rows;
    }

    private List<Map<String, Object>> buildUserRows(ResultReport result) {
        Map<String, Calendar> userSuccessTimestamps = resolveUserSuccessTimestamps(result);
        if (userSuccessTimestamps.isEmpty()) {
            return List.of();
        }

        Map<String, Integer> userRetryCounts = result.getUserRetryCounts() != null ? result.getUserRetryCounts()
                : Map.of();
        Map<String, Calendar> userDisconnectTimestamps = result.getUserDisconnectTimestamps() != null
                ? result.getUserDisconnectTimestamps()
                : Map.of();
        List<UserRetryInfo> users = toSortedUserRetryInfoList(userSuccessTimestamps, userDisconnectTimestamps,
                userRetryCounts);

        List<Map<String, Object>> rows = new ArrayList<>();
        for (UserRetryInfo info : users) {
            rows.add(objectRow("userId", info.userId, "sessionId", info.sessionId,
                    "joinDate", formatDate(info.joinDate),
                    "disconnectDate", info.disconnectDate != null ? formatDate(info.disconnectDate) : "-",
                    "retries", info.retries));
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
            Map<String, Calendar> userDisconnectTimestamps, Map<String, Integer> userRetryCounts) {
        List<UserRetryInfo> users = new ArrayList<>();
        for (Map.Entry<String, Calendar> entry : userSuccessTimestamps.entrySet()) {
            String key = entry.getKey();
            Calendar joinDate = entry.getValue();
            Calendar disconnectDate = userDisconnectTimestamps.get(key);
            int retries = userRetryCounts.getOrDefault(key, 0);
            String[] parts = key.split("-", 2);
            String userId = parts.length > 0 && !parts[0].isEmpty() ? parts[0] : "-";
            String sessionId = parts.length > 1 && !parts[1].isEmpty() ? parts[1] : "-";
            users.add(new UserRetryInfo(userId, sessionId, joinDate, disconnectDate, retries));
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
        rows.add(stringRow(KEY_METRIC, "OpenVidu Recording", KEY_VALUE, safeString(result.getOpenviduRecording())));
        rows.add(stringRow(KEY_METRIC, "Manual Participant Allocation", KEY_VALUE,
                String.valueOf(result.isManualParticipantAllocation())));
        if (result.isManualParticipantAllocation()) {
            rows.add(stringRow(KEY_METRIC, "Users per Worker", KEY_VALUE, String.valueOf(result.getUsersPerWorker())));
        }
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

    private static class UserRetryInfo {
        private final String userId;
        private final String sessionId;
        private final Calendar joinDate;
        private final Calendar disconnectDate;
        private final int retries;

        UserRetryInfo(String userId, String sessionId, Calendar joinDate, Calendar disconnectDate, int retries) {
            this.userId = userId;
            this.sessionId = sessionId;
            this.joinDate = joinDate;
            this.disconnectDate = disconnectDate;
            this.retries = retries;
        }
    }
}