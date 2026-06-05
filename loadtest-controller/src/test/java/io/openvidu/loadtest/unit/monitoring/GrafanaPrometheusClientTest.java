package io.openvidu.loadtest.unit.monitoring;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.net.http.HttpResponse;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.monitoring.GrafanaPrometheusClient;
import io.openvidu.loadtest.utils.CustomHttpClient;

@ExtendWith(MockitoExtension.class)
class GrafanaPrometheusClientTest {

    @Mock
    LoadTestConfig loadTestConfig;

    @Mock
    CustomHttpClient httpClient;

    @InjectMocks
    GrafanaPrometheusClient client;

    @Test
    void testCollectPlatformMetrics_whenGrafanaNotConfigured_returnsEmpty() {
        when(loadTestConfig.isGrafanaEstablished()).thenReturn(false);

        List<PlatformMetric> metrics = client.collectPlatformMetrics("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z");

        assertTrue(metrics.isEmpty());
        verifyNoInteractions(httpClient);
    }

    @Test
    void testCollectPlatformMetrics_success() throws Exception {
        when(loadTestConfig.isGrafanaEstablished()).thenReturn(true);
        when(loadTestConfig.getGrafanaHost()).thenReturn("https://grafana.example.com");
        when(loadTestConfig.getGrafanaUsername()).thenReturn("admin");
        when(loadTestConfig.getGrafanaPassword()).thenReturn("password");
        when(loadTestConfig.getGrafanaDatasourceUid()).thenReturn("openvidu-prometheus");

        String prometheusResponse = """
                {
                	"status": "success",
                	"data": {
                		"result": [
                			{
                				"values": [[1704067200, "10"], [1704067230, "15"], [1704067260, "20"]]
                			}
                		]
                	}
                }""";

        HttpResponse<String> httpResponse = mock(HttpResponse.class);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(prometheusResponse);

        when(httpClient.sendGet(anyString(), anyMap())).thenReturn(httpResponse);

        List<PlatformMetric> metrics = client.collectPlatformMetrics("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z");

        assertFalse(metrics.isEmpty());
        // 15 queries defined in QUERIES, all should succeed
        assertEquals(15, metrics.size());

        PlatformMetric participants = metrics.get(0);
        assertEquals("participants", participants.getName());
        assertEquals("participants", participants.getUnit());
        assertEquals(3, participants.getPoints().size());
        assertEquals(1704067200.0, participants.getPoints().get(0).timestamp(), 0.001);
        assertEquals(10.0, participants.getPoints().get(0).value(), 0.001);
        assertEquals(20.0, participants.getPoints().get(2).value(), 0.001);

        // Verify the HTTP request was sent with basic auth
        verify(httpClient, atLeastOnce()).sendGet(argThat(url -> url.startsWith("https://grafana.example.com")),
                argThat(headers -> headers.containsKey("Authorization")
                        && headers.get("Authorization").startsWith("Basic ")));
    }

    @Test
    void testCollectPlatformMetrics_handlesNanValues() throws Exception {
        when(loadTestConfig.isGrafanaEstablished()).thenReturn(true);
        when(loadTestConfig.getGrafanaHost()).thenReturn("https://grafana.example.com");
        when(loadTestConfig.getGrafanaUsername()).thenReturn("admin");
        when(loadTestConfig.getGrafanaPassword()).thenReturn("password");
        when(loadTestConfig.getGrafanaDatasourceUid()).thenReturn("openvidu-prometheus");

        String responseWithNan = """
                {
                	"status": "success",
                	"data": {
                		"result": [
                			{
                				"values": [[1704067200, "NaN"], [1704067230, "15"], [1704067260, "NaN"]]
                			}
                		]
                	}
                }""";

        HttpResponse<String> httpResponse = mock(HttpResponse.class);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(responseWithNan);

        when(httpClient.sendGet(anyString(), anyMap())).thenReturn(httpResponse);

        List<PlatformMetric> metrics = client.collectPlatformMetrics("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z");

        assertFalse(metrics.isEmpty());
        PlatformMetric metric = metrics.get(0);
        // NaN points should be filtered out
        assertEquals(1, metric.getPoints().size());
        assertEquals(1704067230.0, metric.getPoints().get(0).timestamp(), 0.001);
        assertEquals(15.0, metric.getPoints().get(0).value(), 0.001);
    }

    @Test
    void testCollectPlatformMetrics_partialFailure_returnsPartialResults() throws Exception {
        when(loadTestConfig.isGrafanaEstablished()).thenReturn(true);
        when(loadTestConfig.getGrafanaHost()).thenReturn("https://grafana.example.com");
        when(loadTestConfig.getGrafanaUsername()).thenReturn("admin");
        when(loadTestConfig.getGrafanaPassword()).thenReturn("password");
        when(loadTestConfig.getGrafanaDatasourceUid()).thenReturn("openvidu-prometheus");

        String successResponse = """
                {
                	"status": "success",
                	"data": {
                		"result": [
                			{
                				"values": [[1704067200, "10"]]
                			}
                		]
                	}
                }""";

        HttpResponse<String> successHttpResponse = mock(HttpResponse.class);
        when(successHttpResponse.statusCode()).thenReturn(200);
        when(successHttpResponse.body()).thenReturn(successResponse);

        // First call succeeds, rest fail
        when(httpClient.sendGet(anyString(), anyMap()))
                .thenReturn(successHttpResponse)
                .thenThrow(new RuntimeException("Connection failed"));

        List<PlatformMetric> metrics = client.collectPlatformMetrics("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z");

        // Should have one successful metric despite subsequent failures
        assertFalse(metrics.isEmpty());
        assertEquals(1, metrics.size());
        assertEquals("participants", metrics.get(0).getName());
    }

    @Test
    void testCollectPlatformMetrics_handlesEmptyResult() throws Exception {
        when(loadTestConfig.isGrafanaEstablished()).thenReturn(true);
        when(loadTestConfig.getGrafanaHost()).thenReturn("https://grafana.example.com");
        when(loadTestConfig.getGrafanaUsername()).thenReturn("admin");
        when(loadTestConfig.getGrafanaPassword()).thenReturn("password");
        when(loadTestConfig.getGrafanaDatasourceUid()).thenReturn("openvidu-prometheus");

        String emptyResponse = """
                {
                	"status": "success",
                	"data": {
                		"result": []
                	}
                }""";

        HttpResponse<String> httpResponse = mock(HttpResponse.class);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(emptyResponse);

        when(httpClient.sendGet(anyString(), anyMap())).thenReturn(httpResponse);

        List<PlatformMetric> metrics = client.collectPlatformMetrics("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z");

        // All queries return empty results, so no metrics should be collected
        assertTrue(metrics.isEmpty());
    }

    @Test
    void testCollectPlatformMetrics_prometheusErrorStatus_skipsMetric() throws Exception {
        when(loadTestConfig.isGrafanaEstablished()).thenReturn(true);
        when(loadTestConfig.getGrafanaHost()).thenReturn("https://grafana.example.com");
        when(loadTestConfig.getGrafanaUsername()).thenReturn("admin");
        when(loadTestConfig.getGrafanaPassword()).thenReturn("password");
        when(loadTestConfig.getGrafanaDatasourceUid()).thenReturn("openvidu-prometheus");

        String errorResponse = """
                {
                	"status": "error",
                	"data": null,
                	"errorType": "bad_data",
                	"error": "parse error"
                }""";

        HttpResponse<String> httpResponse = mock(HttpResponse.class);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(errorResponse);

        when(httpClient.sendGet(anyString(), anyMap())).thenReturn(httpResponse);

        List<PlatformMetric> metrics = client.collectPlatformMetrics("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z");

        assertTrue(metrics.isEmpty());
    }
}
