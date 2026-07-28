package io.openvidu.loadtest.unit.monitoring;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregate;
import co.elastic.clients.elasticsearch._types.aggregations.StringTermsBucket;
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
import io.openvidu.loadtest.models.monitoring.NodeMetrics;
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
    void collectNodeMetrics_whenNotInitialized_returnsEmptyList() {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("");

        esClientUnderTest.init();

        assertTrue(esClientUnderTest.collectNodeMetrics("2026-07-01T10:00:00Z", "2026-07-01T10:20:00Z").isEmpty());
    }

    @Test
    void collectNodeMetrics_whenSearchFails_returnsEmptyListWithoutThrowing() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");
        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                throw new IOException("metricbeat index missing");
            }
            return null;
        });
        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        // Node metrics are optional instrumentation, so a failure must not break the report
        assertTrue(esClientUnderTest.collectNodeMetrics("2026-07-01T10:00:00Z", "2026-07-01T10:20:00Z").isEmpty());
    }

    @Test
    void collectNodeMetrics_parsesNodesAndContainersAndOrdersMediaNodesFirst() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        StringTermsBucket caddy = stringBucket("caddy", 90, Map.of(
                "cpu_avg", avg(0.10), "cpu_max", max(0.20), "cpu_samples", valueCount(90), "mem_avg", avg(52428800.0)));
        StringTermsBucket openviduServer = stringBucket("openvidu-server", 90, Map.of(
                "cpu_avg", avg(2.50), "cpu_max", max(3.10), "cpu_samples", valueCount(90), "mem_avg", avg(1073741824.0)));
        SearchResponse<Void> containerResponse = searchResponse(termsAggregate(
                stringBucket("medianode_1", 90, Map.of("containers", termsAggregate(caddy, openviduServer)))));

        SearchResponse<Void> nodeResponse = searchResponse(termsAggregate(
                stringBucket("masternode_1", 180, Map.of(
                        "role", terms("masternode"),
                        "cpu_samples", valueCount(180),
                        "cpu_avg", avg(0.05),
                        "cpu_max", max(0.11),
                        "mem_avg", avg(0.30),
                        "mem_max", max(0.35))),
                stringBucket("medianode_1", 180, Map.of(
                        "role", terms("medianode"),
                        "cpu_samples", valueCount(180),
                        "cpu_avg", avg(0.6789),
                        "cpu_max", max(0.9),
                        "mem_avg", avg(0.42),
                        "mem_max", max(0.55)))));

        // The implementation queries containers first, then whole-node metrics
        List<SearchResponse<Void>> responses = new ArrayList<>(List.of(containerResponse, nodeResponse));
        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                return responses.remove(0);
            }
            return null;
        });
        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        List<NodeMetrics> nodes = esClientUnderTest.collectNodeMetrics("2026-07-01T10:00:00Z",
                "2026-07-01T10:20:00Z");

        assertEquals(2, nodes.size());
        NodeMetrics mediaNode = nodes.get(0);
        assertEquals("medianode_1", mediaNode.getNodeName(), "media nodes lead the report");
        assertTrue(mediaNode.isMediaNode());
        // Metricbeat reports normalized percentages as a 0..1 fraction
        assertEquals(67.89, mediaNode.getCpuAvgPct(), 0.001);
        assertEquals(90.0, mediaNode.getCpuMaxPct(), 0.001);
        assertEquals(42.0, mediaNode.getMemAvgPct(), 0.001);
        assertEquals(180, mediaNode.getSamples());

        // Busiest container first, so the service driving the node's CPU is obvious
        assertEquals(2, mediaNode.getContainers().size());
        assertEquals("openvidu-server", mediaNode.getContainers().get(0).name());
        assertEquals(2.50, mediaNode.getContainers().get(0).cpuAvgCores(), 0.001);
        assertEquals("caddy", mediaNode.getContainers().get(1).name());

        NodeMetrics masterNode = nodes.get(1);
        assertEquals("masternode_1", masterNode.getNodeName());
        assertFalse(masterNode.isMediaNode());
        assertTrue(masterNode.getContainers().isEmpty());
    }

    @Test
    void collectNodeMetrics_withoutDockerModule_stillReportsWholeNodeCpu() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        SearchResponse<Void> emptyContainers = searchResponse(termsAggregate());
        SearchResponse<Void> nodeResponse = searchResponse(termsAggregate(
                stringBucket("medianode_1", 12, Map.of(
                        "role", terms("medianode"),
                        "cpu_samples", valueCount(12),
                        "cpu_avg", avg(0.5),
                        "cpu_max", max(0.5),
                        "mem_avg", avg(0.1),
                        "mem_max", max(0.1)))));

        // Both container name spellings are tried before giving up on containers
        List<SearchResponse<Void>> responses = new ArrayList<>(
                List.of(emptyContainers, emptyContainers, nodeResponse));
        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                return responses.remove(0);
            }
            return null;
        });
        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        List<NodeMetrics> nodes = esClientUnderTest.collectNodeMetrics("2026-07-01T10:00:00Z",
                "2026-07-01T10:20:00Z");

        assertEquals(1, nodes.size());
        assertEquals(50.0, nodes.get(0).getCpuAvgPct(), 0.001);
        assertTrue(nodes.get(0).getContainers().isEmpty());
    }

    @Test
    void collectNodeMetrics_fallsBackToTheMetricbeat7ContainerNameField() throws Exception {
        when(loadTestConfig.getElasticsearchHost()).thenReturn("http://localhost:9200");

        // Metricbeat 8+ reports container.name; Metricbeat 7 reported
        // docker.container.name, so the first query finds nothing on a 7.x node
        SearchResponse<Void> noEcsContainers = searchResponse(termsAggregate());
        SearchResponse<Void> legacyContainers = searchResponse(termsAggregate(
                stringBucket("medianode_1", 30, Map.of("containers", termsAggregate(
                        stringBucket("openvidu-server", 30, Map.of(
                                "cpu_avg", avg(1.25), "cpu_max", max(1.9), "cpu_samples", valueCount(30), "mem_avg", avg(536870912.0))))))));
        SearchResponse<Void> nodeResponse = searchResponse(termsAggregate(
                stringBucket("medianode_1", 30, Map.of(
                        "role", terms("medianode"),
                        "cpu_samples", valueCount(30),
                        "cpu_avg", avg(0.4),
                        "cpu_max", max(0.6),
                        "mem_avg", avg(0.2),
                        "mem_max", max(0.25)))));

        List<SearchResponse<Void>> responses = new ArrayList<>(
                List.of(noEcsContainers, legacyContainers, nodeResponse));
        ElasticsearchClient mockClient = mock(ElasticsearchClient.class, invocation -> {
            if ("search".equals(invocation.getMethod().getName())) {
                return responses.remove(0);
            }
            return null;
        });
        setPrivateField(esClientUnderTest, "client", mockClient);
        setPrivateField(esClientUnderTest, "initialized", true);

        List<NodeMetrics> nodes = esClientUnderTest.collectNodeMetrics("2026-07-01T10:00:00Z",
                "2026-07-01T10:20:00Z");

        assertEquals(1, nodes.size());
        assertEquals(1, nodes.get(0).getContainers().size());
        assertEquals("openvidu-server", nodes.get(0).getContainers().get(0).name());
        assertEquals(1.25, nodes.get(0).getContainers().get(0).cpuAvgCores(), 0.001);
    }

    private static SearchResponse<Void> searchResponse(Aggregate nodesAggregate) {
        return SearchResponse.of(s -> s
                .took(5)
                .timedOut(false)
                .shards(sh -> sh.total(1).successful(1).failed(0))
                .hits(h -> h.hits(List.of()))
                .aggregations("nodes", nodesAggregate));
    }

    /** A `terms` aggregate over the given buckets, as Elasticsearch would return it. */
    private static Aggregate termsAggregate(StringTermsBucket... buckets) {
        return Aggregate.of(a -> a.sterms(t -> t.buckets(b -> b.array(List.of(buckets)))));
    }

    private static StringTermsBucket stringBucket(String key, long docCount, Map<String, Aggregate> subAggregations) {
        return StringTermsBucket.of(b -> b
                .key(FieldValue.of(key))
                .docCount(docCount)
                .aggregations(subAggregations));
    }

    private static Aggregate terms(String key) {
        return Aggregate.of(a -> a.sterms(t -> t.buckets(b -> b.array(
                List.of(StringTermsBucket.of(bb -> bb.key(FieldValue.of(key)).docCount(1)))))));
    }

    private static Aggregate valueCount(long count) {
        return Aggregate.of(a -> a.valueCount(vc -> vc.value((double) count)));
    }

    private static Aggregate avg(double value) {
        return Aggregate.of(a -> a.avg(av -> av.value(value)));
    }

    private static Aggregate max(double value) {
        return Aggregate.of(a -> a.max(mx -> mx.value(value)));
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
