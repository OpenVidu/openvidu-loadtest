package io.openvidu.loadtest.monitoring;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.models.monitoring.PlatformMetric.Point;
import io.openvidu.loadtest.utils.CustomHttpClient;

/**
 * Collects OpenVidu/LiveKit platform metrics from Prometheus for the load
 * test time window. Prometheus is usually not exposed publicly in OpenVidu
 * deployments, but Grafana is, so metrics are queried through the Grafana
 * datasource proxy API.
 */
@Service
public class GrafanaPrometheusClient {

    private static final Logger log = LoggerFactory.getLogger(GrafanaPrometheusClient.class);

    private static final int QUERY_STEP_SECONDS = 30;
    private static final int HTTP_STATUS_OK = 200;

    private record MetricQuery(String name, String promql, String unit, String description) {
    }

    private static final List<MetricQuery> QUERIES = List.of(
            new MetricQuery("participants", "sum(livekit_participant_total)", "participants",
                    "Concurrent participants connected to the platform"),
            new MetricQuery("rooms", "sum(livekit_room_total)", "rooms",
                    "Active rooms on the platform"),
            new MetricQuery("tracks_published", "sum(livekit_track_published_total)", "tracks",
                    "Audio/video tracks published by participants"),
            new MetricQuery("tracks_subscribed", "sum(livekit_track_subscribed_total)", "tracks",
                    "Track subscriptions served (streams forwarded) by the SFU"),
            new MetricQuery("participant_join_rate", "sum(rate(livekit_participant_join_total[1m]))", "joins/s",
                    "Rate at which participants join rooms"),
            new MetricQuery("bandwidth_in", "sum(rate(livekit_packet_bytes{direction=\"incoming\"}[1m])) * 8", "bps",
                    "Media traffic received from publishers"),
            new MetricQuery("bandwidth_out", "sum(rate(livekit_packet_bytes{direction=\"outgoing\"}[1m])) * 8", "bps",
                    "Media traffic sent to subscribers"),
            new MetricQuery("packets_in", "sum(rate(livekit_packet_total{direction=\"incoming\"}[1m]))", "pkts/s",
                    "RTP packets per second received"),
            new MetricQuery("packets_out", "sum(rate(livekit_packet_total{direction=\"outgoing\"}[1m]))", "pkts/s",
                    "RTP packets per second sent"),
            new MetricQuery("packet_loss",
                    "100 * sum(rate(livekit_packet_loss_total[1m])) / sum(rate(livekit_packet_total[1m]))", "%",
                    "Platform-wide percentage of RTP packets lost"),
            new MetricQuery("rtt_p95", "histogram_quantile(0.95, sum(rate(livekit_rtt_ms_bucket[1m])) by (le))", "ms",
                    "95th percentile round-trip time between clients and the platform"),
            new MetricQuery("jitter_p95",
                    "histogram_quantile(0.95, sum(rate(livekit_jitter_us_bucket[1m])) by (le)) / 1000", "ms",
                    "95th percentile packet arrival jitter"),
            new MetricQuery("nack_rate", "sum(rate(livekit_nack_total[1m]))", "nacks/s",
                    "Retransmission requests per second (signals packet loss)"),
            new MetricQuery("pli_rate", "sum(rate(livekit_pli_total[1m]))", "plis/s",
                    "Keyframe requests per second (signals video corruption)"),
            new MetricQuery("quality_score",
                    "sum(rate(livekit_quality_score_sum[1m])) / sum(rate(livekit_quality_score_count[1m]))",
                    "score",
                    "LiveKit connection quality score (0 worst, 5 best)"));

    private final LoadTestConfig loadTestConfig;
    private final CustomHttpClient httpClient;

    public GrafanaPrometheusClient(LoadTestConfig loadTestConfig, CustomHttpClient httpClient) {
        this.loadTestConfig = loadTestConfig;
        this.httpClient = httpClient;
    }

    /**
     * Queries every curated metric for the given time window (ISO-8601
     * timestamps, e.g. 2026-06-04T17:19:58Z). Failures on individual metrics
     * are logged and skipped so a partial collection is still returned.
     */
    public List<PlatformMetric> collectPlatformMetrics(String startTime, String endTime) {
        if (!loadTestConfig.isGrafanaEstablished()) {
            log.info("Grafana host parameter is empty. Platform metrics won't be collected.");
            return List.of();
        }

        log.info("Collecting platform metrics from Grafana at {}", loadTestConfig.getGrafanaHost());
        List<PlatformMetric> metrics = new ArrayList<>();
        for (MetricQuery query : QUERIES) {
            try {
                List<Point> points = queryRange(query.promql(), startTime, endTime);
                if (!points.isEmpty()) {
                    metrics.add(new PlatformMetric(query.name(), query.unit(), query.description(), points));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("Interrupted while collecting platform metric '{}'", query.name());
                return metrics;
            } catch (Exception e) {
                log.warn("Could not collect platform metric '{}': {}", query.name(), e.getMessage());
            }
        }
        log.info("Collected {} platform metrics from Grafana", metrics.size());
        return metrics;
    }

    private List<Point> queryRange(String promql, String startTime, String endTime)
            throws Exception {
        String baseUrl = loadTestConfig.getGrafanaHost().replaceAll("/$", "");
        String url = URI.create(baseUrl
                + "/api/datasources/proxy/uid/" + loadTestConfig.getGrafanaDatasourceUid()
                + "/api/v1/query_range").toString()
                + "?query=" + URLEncoder.encode(promql, StandardCharsets.UTF_8)
                + "&start=" + URLEncoder.encode(startTime, StandardCharsets.UTF_8)
                + "&end=" + URLEncoder.encode(endTime, StandardCharsets.UTF_8)
                + "&step=" + QUERY_STEP_SECONDS;

        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", getBasicAuth());
        HttpResponse<String> response = httpClient.sendGet(url, headers);
        if (response.statusCode() != HTTP_STATUS_OK) {
            throw new IllegalStateException(
                    "Grafana returned status " + response.statusCode() + ": " + response.body());
        }

        JsonObject body = JsonParser.parseString(response.body()).getAsJsonObject();
        if (!"success".equals(body.get("status").getAsString())) {
            throw new IllegalStateException("Prometheus query failed: " + response.body());
        }

        List<Point> points = new ArrayList<>();
        JsonArray result = body.getAsJsonObject("data").getAsJsonArray("result");
        if (result.isEmpty()) {
            return points;
        }
        // Curated queries are aggregated, so a single series is expected
        JsonArray values = result.get(0).getAsJsonObject().getAsJsonArray("values");
        for (int i = 0; i < values.size(); i++) {
            JsonArray pair = values.get(i).getAsJsonArray();
            String value = pair.get(1).getAsString();
            if (!"NaN".equals(value)) {
                points.add(new Point(pair.get(0).getAsDouble(), Double.parseDouble(value)));
            }
        }
        return points;
    }

    private String getBasicAuth() {
        String credentials = loadTestConfig.getGrafanaUsername() + ":" + loadTestConfig.getGrafanaPassword();
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }
}
