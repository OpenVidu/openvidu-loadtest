package io.openvidu.loadtest.unit.monitoring;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;

import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;

import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.elasticsearch.core.search.HitsMetadata;

import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.transport.endpoints.BooleanResponse;
import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.LoadTestInitializationException;
import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.models.monitoring.PlatformMetric.Point;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.services.Sleeper;

import java.lang.reflect.Field;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ElasticSearchClientTest {

    @Mock
    LoadTestConfig loadTestConfig;

    @Mock
    Sleeper sleeper;

    @InjectMocks
    ElasticSearchClient esClientUnderTest;

    @Test
    void init_withNoHost_shouldRemainNotInitialized() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("");

        // calling init should be safe and not try to connect when host is empty
        esClientUnderTest.init();
        assertFalse(esClientUnderTest.isInitialized());
    }

    @Test
    void init_withPathPrefix_shouldCallSetPathPrefix() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("https://host:9200/elasticsearch");
        esClientUnderTest.maxRetries = 1;
        esClientUnderTest.retryDelayMs = 0;

        RestClientBuilder builderMock = mock(RestClientBuilder.class);
        RestClient restClientMock = mock(RestClient.class);

        try (MockedStatic<RestClient> restClientStatic = mockStatic(RestClient.class)) {
            restClientStatic.when(() -> RestClient.builder(any(HttpHost.class))).thenReturn(builderMock);
            when(builderMock.build()).thenReturn(restClientMock);

            // init() will try to ping and fail with LoadTestInitializationException
            // because there's no real ES server, but we still verify setPathPrefix was
            // called
            assertThrows(LoadTestInitializationException.class, () -> esClientUnderTest.init());

            verify(builderMock).setPathPrefix("/elasticsearch");
        }
    }

    @Test
    void init_withPathPrefix_httpHostDropsPath() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("https://host:9200/elasticsearch");
        esClientUnderTest.maxRetries = 1;
        esClientUnderTest.retryDelayMs = 0;

        RestClientBuilder builderMock = mock(RestClientBuilder.class);
        RestClient restClientMock = mock(RestClient.class);

        try (MockedStatic<RestClient> restClientStatic = mockStatic(RestClient.class)) {
            ArgumentCaptor<HttpHost> httpHostCaptor = ArgumentCaptor.forClass(HttpHost.class);

            restClientStatic.when(() -> RestClient.builder(httpHostCaptor.capture())).thenReturn(builderMock);
            when(builderMock.build()).thenReturn(restClientMock);

            assertThrows(LoadTestInitializationException.class, () -> esClientUnderTest.init());

            // HttpHost should only have host/port/scheme, not the path
            HttpHost capturedHost = httpHostCaptor.getValue();
            assertEquals("host", capturedHost.getHostName());
            assertEquals(9200, capturedHost.getPort());
            assertEquals("https", capturedHost.getSchemeName());
        }
    }

    @Test
    void init_withoutPathPrefix_shouldNotCallSetPathPrefix() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");
        esClientUnderTest.maxRetries = 1;
        esClientUnderTest.retryDelayMs = 0;

        RestClientBuilder builderMock = mock(RestClientBuilder.class);
        RestClient restClientMock = mock(RestClient.class);

        try (MockedStatic<RestClient> restClientStatic = mockStatic(RestClient.class)) {
            restClientStatic.when(() -> RestClient.builder(any(HttpHost.class))).thenReturn(builderMock);
            when(builderMock.build()).thenReturn(restClientMock);

            assertThrows(LoadTestInitializationException.class, () -> esClientUnderTest.init());

            verify(builderMock, never()).setPathPrefix(anyString());
        }
    }

    @Test
    void init_withRootPath_shouldNotCallSetPathPrefix() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200/");
        esClientUnderTest.maxRetries = 1;
        esClientUnderTest.retryDelayMs = 0;

        RestClientBuilder builderMock = mock(RestClientBuilder.class);
        RestClient restClientMock = mock(RestClient.class);

        try (MockedStatic<RestClient> restClientStatic = mockStatic(RestClient.class)) {
            restClientStatic.when(() -> RestClient.builder(any(HttpHost.class))).thenReturn(builderMock);
            when(builderMock.build()).thenReturn(restClientMock);

            assertThrows(LoadTestInitializationException.class, () -> esClientUnderTest.init());

            verify(builderMock, never()).setPathPrefix(anyString());
        }
    }

    @Test
    void getMediaNodeCpu_whenSearchThrowsIOException_returnsZero() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");
        // Create a mock ElasticsearchClient that throws IOException for any search
        // invocation
        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                throw new IOException("boom");
            }
            return null;
        });

        // Inject mock client via reflection
        setPrivateField(esClientUnderTest, "client", mockClient);

        double cpu = esClientUnderTest.getMediaNodeCpu();
        assertEquals(0.0, cpu);
    }

    @Test
    void getMediaNodeCpu_whenSearchReturnsEmptyHits_returnsZero() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        // Build a SearchResponse mock that will cause the code to treat it as
        // empty/unusable
        Object mockResp = mock((Class<?>) SearchResponse.class);

        // Create a client that returns the mock response for any search invocation
        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                return mockResp;
            }
            return null;
        });

        // Inject mock client
        setPrivateField(esClientUnderTest, "client", mockClient);

        // Calling getMediaNodeCpu should handle missing/empty data and return 0.0
        double cpu = esClientUnderTest.getMediaNodeCpu();
        assertEquals(0.0, cpu);
    }

    @SuppressWarnings("unchecked")
    @Test
    void getMediaNodeCpu_whenSearchReturnsHit_parsesCpuPercent() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        // Build a JsonNode shaped like the expected ES document
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode pct = mapper.createObjectNode();
        pct.put("pct", 0.123);
        ObjectNode norm = mapper.createObjectNode();
        norm.set("pct", pct.get("pct"));
        ObjectNode total = mapper.createObjectNode();
        total.set("norm", norm);
        ObjectNode cpuNode = mapper.createObjectNode();
        cpuNode.set("total", total);
        ObjectNode system = mapper.createObjectNode();
        system.set("cpu", cpuNode);
        ObjectNode root = mapper.createObjectNode();
        root.set("system", system);
        JsonNode source = root;

        Hit<JsonNode> hit = (Hit<JsonNode>) mock((Class<?>) Hit.class);
        when(hit.source()).thenReturn(source);

        HitsMetadata<JsonNode> hitsMeta = (HitsMetadata<JsonNode>) mock((Class<?>) HitsMetadata.class);
        when(hitsMeta.hits()).thenReturn(List.of(hit));

        Object resp = mock((Class<?>) SearchResponse.class);
        when(((SearchResponse<JsonNode>) resp).hits()).thenReturn(hitsMeta);

        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                return resp;
            }
            return null;
        });

        setPrivateField(esClientUnderTest, "client", mockClient);

        double resultCpu = esClientUnderTest.getMediaNodeCpu();
        // Expect 0.123 * 100 -> 12.3 (formatted to three decimals in the
        // implementation)
        assertEquals(12.3, resultCpu);
    }

    @Test
    void indexPlatformMetrics_whenNotInitialized_skipsIndexing() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("");

        esClientUnderTest.init();
        assertFalse(esClientUnderTest.isInitialized());

        List<PlatformMetric> metrics = new ArrayList<>();
        metrics.add(new PlatformMetric("test", "ms", "test", List.of(new Point(1000.0, 10.0))));

        // Should not throw despite no Elasticsearch client being configured
        esClientUnderTest.indexPlatformMetrics(metrics);
    }

    @Test
    void indexPlatformMetrics_withEmptyList_doesNothing() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        ElasticsearchClient mockClient = mock(ElasticsearchClient.class);
        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        esClientUnderTest.indexPlatformMetrics(new ArrayList<>());

        verify(mockClient, never()).indices();
        verify(mockClient, never()).bulk(any(BulkRequest.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    void indexPlatformMetrics_success() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        ElasticsearchClient mockClient = mock(ElasticsearchClient.class);

        // Mock the indices().create() chain
        co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient mockIndices = mock(
                co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient.class);
        when(mockClient.indices()).thenReturn(mockIndices);

        BooleanResponse notExistsResponse = mock(BooleanResponse.class);
        when(notExistsResponse.value()).thenReturn(false);
        when(mockIndices.exists(any(java.util.function.Function.class))).thenReturn(notExistsResponse);

        // Mock the bulk response
        BulkResponse mockBulkResponse = mock(BulkResponse.class);
        when(mockBulkResponse.errors()).thenReturn(false);
        when(mockClient.bulk(any(BulkRequest.class))).thenReturn(mockBulkResponse);

        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        List<PlatformMetric> metrics = new ArrayList<>();
        List<Point> points = new ArrayList<>();
        points.add(new Point(1000.0, 10.0));
        points.add(new Point(2000.0, 20.0));
        metrics.add(new PlatformMetric("participants", "count", "Concurrent participants", points));

        esClientUnderTest.indexPlatformMetrics(metrics);

        verify(mockIndices).create(any(java.util.function.Function.class));
        verify(mockClient).bulk(any(BulkRequest.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    void indexPlatformMetrics_logsErrorOnBulkFailure() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        ElasticsearchClient mockClient = mock(ElasticsearchClient.class);

        co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient mockIndices = mock(
                co.elastic.clients.elasticsearch.indices.ElasticsearchIndicesClient.class);
        when(mockClient.indices()).thenReturn(mockIndices);

        BooleanResponse notExistsResponse = mock(BooleanResponse.class);
        when(notExistsResponse.value()).thenReturn(false);
        when(mockIndices.exists(any(java.util.function.Function.class))).thenReturn(notExistsResponse);

        BulkResponse mockBulkResponse = mock(BulkResponse.class);
        when(mockBulkResponse.errors()).thenReturn(true);
        when(mockClient.bulk(any(BulkRequest.class))).thenReturn(mockBulkResponse);

        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        List<PlatformMetric> metrics = new ArrayList<>();
        metrics.add(new PlatformMetric("test", "ms", "test", List.of(new Point(1000.0, 10.0))));

        // Should not throw even when bulk returns errors
        esClientUnderTest.indexPlatformMetrics(metrics);
    }

    private static void setPrivateField(Object target, String fieldName, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(target, value);
    }
}
