package io.openvidu.loadtest.monitoring;

import java.io.IOException;
import java.net.URI;
import java.text.DecimalFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.annotation.PostConstruct;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.BulkResponse;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import co.elastic.clients.transport.ElasticsearchTransport;
import co.elastic.clients.transport.endpoints.BooleanResponse;

import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.LoadTestInitializationException;
import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.models.monitoring.PlatformMetric.Point;
import io.openvidu.loadtest.services.Sleeper;

@Service
public class ElasticSearchClient {

    private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

    private LoadTestConfig loadTestConfig;

    private ElasticsearchClient client;

    private static DecimalFormat df2 = new DecimalFormat("#.###");

    private boolean initialized = false;

    public int maxRetries = 10;
    public int retryDelayMs = 5000;

    private Sleeper sleeper;

    public ElasticSearchClient(LoadTestConfig loadTestConfig, Sleeper sleeper) {
        this.loadTestConfig = loadTestConfig;
        this.sleeper = sleeper;
    }

    @PostConstruct
    public void init() {
        String elasticsearchHost = loadTestConfig.getElasticsearchHost();
        if (elasticsearchHost == null || elasticsearchHost.isEmpty()) {
            log.warn("Property 'ELASTICSEARCH_HOST' is not defined");
            return;
        }

        try {
            URI uri = URI.create(elasticsearchHost);
            HttpHost httpHost = new HttpHost(uri.getHost(), uri.getPort(), uri.getScheme());

            RestClientBuilder restClientBuilder = RestClient.builder(httpHost);
            // Keep the URL path (e.g. https://host/elasticsearch) when Elasticsearch
            // is served behind a reverse proxy with a path prefix
            String pathPrefix = uri.getPath();
            if (pathPrefix != null && !pathPrefix.isEmpty() && !"/".equals(pathPrefix)) {
                restClientBuilder.setPathPrefix(pathPrefix);
            }
            if (loadTestConfig.isElasticSearchSecured()) {
                BasicCredentialsProvider credentialsProvider = new BasicCredentialsProvider();
                String esUserName = loadTestConfig.getElasticsearchUserName();
                String esPassword = loadTestConfig.getElasticsearchPassword();
                credentialsProvider.setCredentials(AuthScope.ANY,
                        new UsernamePasswordCredentials(esUserName, esPassword));
                restClientBuilder.setHttpClientConfigCallback(httpClientBuilder -> httpClientBuilder
                        .setDefaultCredentialsProvider(credentialsProvider));
            }
            RestClient restClient = restClientBuilder.build();

            ElasticsearchTransport transport = new RestClientTransport(restClient, new JacksonJsonpMapper());
            this.client = new ElasticsearchClient(transport);

            for (int i = 1; i <= this.maxRetries; i++) {
                try {
                    if (doPing()) {
                        this.initialized = true;
                        log.info("Connection to Elasticsearch established at {}", elasticsearchHost);
                        return;
                    }
                } catch (Exception e) {
                    log.warn("Connection to Elasticsearch failed (attempt {}/{}): {}", i, this.maxRetries,
                            e.getMessage());
                }
                if (i < this.maxRetries) {
                    this.sleeper.sleep(this.retryDelayMs / 1000, "retrying Elasticsearch connection");
                }
            }
            String message = "Connection to Elasticsearch failed at " + loadTestConfig.getElasticsearchHost()
                    + " after " + this.maxRetries + " attempts (retry delay " + (this.retryDelayMs / 1000) + "s)"
                    + ". If property 'ELASTICSEARCH_HOST' is defined, then it is mandatory that OpenVidu Load Test is able to connect to it";
            log.error(message);
            throw new LoadTestInitializationException(message);
        } catch (LoadTestInitializationException e) {
            throw e;
        } catch (Exception e) {
            String message = "Connection to Elasticsearch failed at " + loadTestConfig.getElasticsearchHost()
                    + " (" + e.getMessage()
                    + "). If property 'ELASTICSEARCH_HOST' is defined, then it is mandatory that OpenVidu Load Test is able to connect to it";
            log.error(message);
            throw new LoadTestInitializationException(message, e);
        }
    }

    private boolean doPing() throws ElasticsearchException, IOException {
        BooleanResponse response = this.client.ping();
        return response.value();
    }

    public boolean isInitialized() {
        return this.initialized;
    }

    /**
     * Indexes the platform metrics collected from Prometheus (through
     * Grafana) into a date-rolling 'loadtest-openvidu-metrics-YYYY.MM.dd' index,
     * covered by the same 'loadtest-*' Kibana index pattern as the WebRTC stats.
     */
    public void indexPlatformMetrics(List<PlatformMetric> metrics) {
        if (!this.initialized) {
            log.warn("Elasticsearch is not initialized. Platform metrics won't be indexed.");
            return;
        }
        if (metrics.isEmpty()) {
            return;
        }

        String indexName = "loadtest-openvidu-metrics-"
                + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy.MM.dd"));
        try {
            boolean exists = this.client.indices().exists(e -> e.index(indexName)).value();
            if (!exists) {
                this.client.indices().create(c -> c.index(indexName).mappings(m -> m
                        .properties("@timestamp", p -> p.date(d -> d))
                        .properties("metric", p -> p.keyword(k -> k))
                        .properties("value", p -> p.double_(d -> d))
                        .properties("unit", p -> p.keyword(k -> k))
                        .properties("source", p -> p.keyword(k -> k))));
            }

            BulkRequest.Builder bulkBuilder = new BulkRequest.Builder();
            int documents = 0;
            for (PlatformMetric metric : metrics) {
                for (Point point : metric.getPoints()) {
                    Map<String, Object> document = new HashMap<>();
                    document.put("@timestamp", Instant.ofEpochSecond((long) point.timestamp()).toString());
                    document.put("metric", metric.getName());
                    document.put("value", point.value());
                    document.put("unit", metric.getUnit());
                    document.put("source", "grafana-prometheus");
                    bulkBuilder.operations(op -> op.index(idx -> idx.index(indexName).document(document)));
                    documents++;
                }
            }
            BulkResponse response = this.client.bulk(bulkBuilder.build());
            if (response.errors()) {
                log.error("Elasticsearch bulk indexing of platform metrics reported errors");
            } else {
                log.info("Indexed {} platform metric documents into '{}'", documents, indexName);
            }
        } catch (Exception e) {
            log.error("Could not index platform metrics into Elasticsearch", e);
        }
    }

    public double getMediaNodeCpu() {
        try {
            SearchResponse<JsonNode> searchResponse = this.client.search(s -> s
                    .index("metricbeat*")
                    .query(q -> q
                            .bool(b -> b
                                    .must(m -> m.match(ma -> ma.field("fields.node_role").query("medianode")))
                                    .must(m -> m.exists(e -> e.field("system.cpu")))))
                    .sort(so -> so.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                    .size(1),
                    JsonNode.class);

            if (searchResponse.hits().hits().isEmpty()) {
                log.warn("No media node CPU data found");
                return 0.0;
            }

            Hit<JsonNode> hit = searchResponse.hits().hits().get(0);
            JsonNode source = hit.source();

            if (source == null) {
                log.warn("Empty source in search result");
                return 0.0;
            }

            double cpu = source.get("system").get("cpu").get("total")
                    .get("norm").get("pct").asDouble();
            log.info("Media node CPU is {}", cpu * 100);
            return Double.parseDouble(df2.format(cpu * 100));

        } catch (IOException e) {
            log.error(e.getMessage());
            e.printStackTrace();
            return 0.0;
        } catch (Exception e) {
            log.error("Error getting media node CPU: {}", e.getMessage());
            e.printStackTrace();
            return 0.0;
        }
    }
}
