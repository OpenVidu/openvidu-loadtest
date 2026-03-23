package io.openvidu.loadtest.monitoring;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.elasticsearch.core.search.HitsMetadata;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import io.openvidu.loadtest.config.LoadTestConfig;

import java.lang.reflect.Field;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ElasticSearchClientTest {

    @Mock
    LoadTestConfig loadTestConfig;

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

    private static void setPrivateField(Object target, String fieldName, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(target, value);
    }
}
