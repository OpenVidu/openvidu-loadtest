package io.openvidu.loadtest.utils;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;

import io.openvidu.loadtest.models.testcase.ResultReport;

@Component
public class HtmlReportGenerator {

    private static final Logger log = LoggerFactory.getLogger(HtmlReportGenerator.class);
    private static final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

    public void generateHtmlReport(ResultReport result, String fileName) throws IOException {
        String resultsDir = System.getenv("RESULTS_DIR");
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

        try (FileWriter fw = new FileWriter(resultPath);
                BufferedWriter bw = new BufferedWriter(fw)) {
            bw.write(generateHtmlContent(result));
        }
        log.info("Saved HTML report in {}", resultPath);
    }

    private String generateHtmlContent(ResultReport result) {
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html>\n");
        html.append("<html lang=\"en\">\n");
        html.append("<head>\n");
        html.append("    <meta charset=\"UTF-8\">\n");
        html.append("    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
        html.append("    <title>OpenVidu Load Test Report</title>\n");
        html.append("    <style>\n");
        html.append("        body { font-family: Arial, sans-serif; margin: 40px; }\n");
        html.append("        h1 { color: #333; }\n");
        html.append("        h2 { color: #555; margin-top: 30px; }\n");
        html.append("        table { border-collapse: collapse; width: 100%; margin: 20px 0; }\n");
        html.append("        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }\n");
        html.append("        th { background-color: #f2f2f2; }\n");
        html.append("        tr:nth-child(even) { background-color: #f9f9f9; }\n");
        html.append("        .metric { font-weight: bold; }\n");
        html.append("        .value { }\n");
        html.append("        .section { margin-bottom: 40px; }\n");
        html.append("    </style>\n");
        html.append("</head>\n");
        html.append("<body>\n");
        html.append("    <h1>OpenVidu Load Test Report</h1>\n");
        html.append("    <p>Generated: ").append(dateFormat.format(result.getStartTime().getTime())).append("</p>\n");

        // Summary section
        html.append("    <div class=\"section\">\n");
        html.append("        <h2>Summary</h2>\n");
        html.append("        <table>\n");
        html.append("            <tr><td class=\"metric\">Test Duration</td><td class=\"value\">")
                .append(getDuration(result)).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Sessions Created</td><td class=\"value\">")
                .append(result.getNumSessionsCreated()).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Sessions Completed</td><td class=\"value\">")
                .append(result.getNumSessionsCompleted()).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Total Participants</td><td class=\"value\">")
                .append(result.getTotalParticipants()).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Workers Used</td><td class=\"value\">")
                .append(result.getWorkersUsed()).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Stop Reason</td><td class=\"value\">")
                .append(result.getStopReason()).append("</td></tr>\n");
        html.append("        </table>\n");
        html.append("    </div>\n");

        // Error categorization
        Map<String, Integer> errorCounts = result.getErrorCounts();
        if (!errorCounts.isEmpty()) {
            html.append("    <div class=\"section\">\n");
            html.append("        <h2>Error Categorization</h2>\n");
            html.append("        <table>\n");
            html.append("            <tr><th>Error Reason</th><th>Count</th><th>Percentage</th></tr>\n");
            int totalErrors = errorCounts.values().stream().mapToInt(Integer::intValue).sum();
            for (Map.Entry<String, Integer> entry : errorCounts.entrySet()) {
                double percentage = (double) entry.getValue() / totalErrors * 100;
                html.append("            <tr><td>").append(escapeHtml(entry.getKey())).append("</td><td>")
                        .append(entry.getValue()).append("</td><td>").append(String.format("%.1f%%", percentage))
                        .append("</td></tr>\n");
            }
            html.append("        </table>\n");
            html.append("    </div>\n");
        }

        // Worker CPU utilization
        Map<String, Double> cpuAvg = result.getWorkerCpuAvg();
        Map<String, Double> cpuMax = result.getWorkerCpuMax();
        if (!cpuAvg.isEmpty()) {
            html.append("    <div class=\"section\">\n");
            html.append("        <h2>Worker CPU Utilization</h2>\n");
            html.append("        <table>\n");
            html.append("            <tr><th>Worker</th><th>Average CPU %</th><th>Max CPU %</th></tr>\n");
            for (String worker : cpuAvg.keySet()) {
                html.append("            <tr><td>").append(escapeHtml(worker)).append("</td><td>")
                        .append(String.format("%.1f%%", cpuAvg.get(worker))).append("</td><td>")
                        .append(String.format("%.1f%%", cpuMax.get(worker))).append("</td></tr>\n");
            }
            html.append("        </table>\n");
            html.append("    </div>\n");
        }

        // Per-user connections
        Map<String, Calendar> userSuccessTimestamps = result.getUserSuccessTimestamps();
        Map<String, Integer> userRetryCounts = result.getUserRetryCounts();
        Map<String, Calendar> userDisconnectTimestamps = result.getUserDisconnectTimestamps();
        // If userSuccessTimestamps is empty, compute from userStartTimes
        if (userSuccessTimestamps.isEmpty() && !result.getUserStartTimes().isEmpty()) {
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
            userSuccessTimestamps = computed;
            log.warn("Computed userSuccessTimestamps from userStartTimes, size: {}", computed.size());
        }
        log.debug("User success timestamps count: {}", userSuccessTimestamps.size());
        for (String key : userSuccessTimestamps.keySet()) {
            log.debug("  key: {}", key);
        }
        // Always generate the table, even if empty
        html.append("    <div class=\"section\">\n");
        html.append("        <h2>User Connections</h2>\n");
        html.append("        <table>\n");
        html.append(
                "            <tr><th>User</th><th>Session</th><th>Join date</th><th>Disconnect Date</th><th>Retry Number</th></tr>\n");
        if (!userSuccessTimestamps.isEmpty()) {
            // Prepare list of rows for sorting
            List<UserRetryInfo> rows = new ArrayList<>();
            for (String key : userSuccessTimestamps.keySet()) {
                Calendar joinDate = userSuccessTimestamps.get(key);
                Calendar disconnectDate = userDisconnectTimestamps.get(key);
                int retries = userRetryCounts.getOrDefault(key, 0);
                String[] parts = key.split("-", 2);
                String userId = parts.length > 0 && !parts[0].isEmpty() ? parts[0] : "-";
                String sessionId = parts.length > 1 && !parts[1].isEmpty() ? parts[1] : "-";
                rows.add(new UserRetryInfo(userId, sessionId, joinDate, disconnectDate, retries));
            }
            // Sort by session, user, retry number
            rows.sort((a, b) -> {
                int cmp = a.sessionId.compareTo(b.sessionId);
                if (cmp != 0)
                    return cmp;
                cmp = a.userId.compareTo(b.userId);
                if (cmp != 0)
                    return cmp;
                return Integer.compare(a.retries, b.retries);
            });
            for (UserRetryInfo info : rows) {
                String formattedJoin = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(info.joinDate.getTime());
                String formattedDisconnect = info.disconnectDate != null
                        ? new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(info.disconnectDate.getTime())
                        : "-";
                html.append("            <tr><td>").append(escapeHtml(info.userId)).append("</td><td>")
                        .append(escapeHtml(info.sessionId)).append("</td><td>").append(formattedJoin)
                        .append("</td><td>")
                        .append(formattedDisconnect).append("</td><td>").append(info.retries).append("</td></tr>\n");
            }
        } else {
            // No participants row
            html.append("            <tr><td colspan=\"5\">No participants</td></tr>\n");
        }
        html.append("        </table>\n");
        html.append("    </div>\n");

        // Configuration details
        html.append("    <div class=\"section\">\n");
        html.append("        <h2>Configuration</h2>\n");
        html.append("        <table>\n");
        html.append("            <tr><td class=\"metric\">Session Topology</td><td class=\"value\">")
                .append(escapeHtml(result.getSessionTopology())).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Participants per Session</td><td class=\"value\">")
                .append(escapeHtml(result.getParticipantsPerSession())).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Browser Recording</td><td class=\"value\">")
                .append(result.isBrowserRecording()).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">OpenVidu Recording</td><td class=\"value\">")
                .append(escapeHtml(result.getOpenviduRecording())).append("</td></tr>\n");
        html.append("            <tr><td class=\"metric\">Manual Participant Allocation</td><td class=\"value\">")
                .append(result.isManualParticipantAllocation()).append("</td></tr>\n");
        if (result.isManualParticipantAllocation()) {
            html.append("            <tr><td class=\"metric\">Users per Worker</td><td class=\"value\">")
                    .append(result.getUsersPerWorker()).append("</td></tr>\n");
        }
        String kibanaUrl = result.getKibanaUrl();
        if (kibanaUrl != null && !kibanaUrl.trim().isEmpty() && !kibanaUrl.contains("not found")) {
            if (!kibanaUrl.startsWith("http://") && !kibanaUrl.startsWith("https://")) {
                html.append("            <tr><td class=\"metric\">Kibana Dashboard</td><td class=\"value\">")
                        .append(kibanaUrl).append("</td></tr>\n");
            } else {
                html.append("            <tr><td class=\"metric\">Kibana Dashboard</td><td class=\"value\"><a href=\"")
                        .append(escapeHtml(kibanaUrl)).append("\" target=\"_blank\">Link</a></td></tr>\n");
            }
        }
        html.append("        </table>\n");
        html.append("    </div>\n");

        html.append("</body>\n");
        html.append("</html>\n");
        return html.toString();
    }

    private String getDuration(ResultReport result) {
        long diffInMillis = Math
                .abs(result.getEndTime().getTime().getTime() - result.getStartTime().getTime().getTime());
        long seconds = diffInMillis / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;
        seconds %= 60;
        minutes %= 60;
        return String.format("%dh %dm %ds", hours, minutes, seconds);
    }

    private String escapeHtml(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static class UserRetryInfo {
        String userId;
        String sessionId;
        Calendar joinDate;
        Calendar disconnectDate;
        int retries;

        UserRetryInfo(String userId, String sessionId, Calendar joinDate, Calendar disconnectDate, int retries) {
            this.userId = userId;
            this.sessionId = sessionId;
            this.joinDate = joinDate;
            this.disconnectDate = disconnectDate;
            this.retries = retries;
        }
    }
}