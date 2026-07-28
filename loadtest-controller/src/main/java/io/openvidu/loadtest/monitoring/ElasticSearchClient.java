package io.openvidu.loadtest.monitoring;

import java.io.IOException;
import java.net.URI;
import java.text.DecimalFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.annotation.PostConstruct;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.ElasticsearchException;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregate;
import co.elastic.clients.elasticsearch._types.aggregations.StringTermsBucket;
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
import io.openvidu.loadtest.models.monitoring.NodeMetrics;
import io.openvidu.loadtest.models.monitoring.NodeMetrics.ContainerMetrics;
import io.openvidu.loadtest.models.monitoring.PlatformMetric;
import io.openvidu.loadtest.models.monitoring.PlatformMetric.Point;
import io.openvidu.loadtest.services.Sleeper;

@Service
public class ElasticSearchClient {

    private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

    private static final String METRICBEAT_INDEX = "metricbeat*";
    private static final String TIMESTAMP_FIELD = "@timestamp";
    /** Custom Metricbeat fields set by server-resources/metricbeat-configs/metricbeat.yml */
    private static final String NODE_NAME_FIELD = "fields.worker_name";
    private static final String NODE_ROLE_FIELD = "fields.node_role";
    private static final int MAX_NODES = 100;
    private static final int MAX_ROLES = 5;
    private static final int MAX_CONTAINERS = 30;

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

    /**
     * Aggregates the Metricbeat samples the nodes of the OpenVidu deployment
     * shipped during the given window (ISO-8601 timestamps, same window used for
     * the platform metrics) into one {@link NodeMetrics} per node.
     *
     * <p>
     * Requires Metricbeat to be running on the media/master nodes with the
     * configuration in {@code server-resources/metricbeat-configs/metricbeat.yml}
     * (see {@code docs/ov-monitoring.md}). Per-container figures additionally
     * require its {@code docker} module. A missing or partial setup is not an
     * error: whatever is available is returned, and an empty list means no node
     * shipped anything for the window.
     */
    public List<NodeMetrics> collectNodeMetrics(String startTime, String endTime) {
        if (!this.initialized) {
            log.info("Elasticsearch is not initialized. Node metrics won't be collected.");
            return List.of();
        }

        try {
            Map<String, List<ContainerMetrics>> containersByNode = collectContainerMetrics(startTime, endTime);
            SearchResponse<Void> response = this.client.search(s -> s
                    .index(METRICBEAT_INDEX)
                    .size(0)
                    .query(q -> q.bool(b -> b
                            .filter(f -> f.range(r -> r.date(d -> d.field(TIMESTAMP_FIELD)
                                    .gte(startTime).lte(endTime))))
                            .filter(f -> f.exists(e -> e.field("system.cpu.total.norm.pct")))))
                    .aggregations("nodes", a -> a
                            .terms(t -> t.field(NODE_NAME_FIELD).size(MAX_NODES))
                            .aggregations("role", sa -> sa.terms(t -> t.field(NODE_ROLE_FIELD).size(MAX_ROLES)))
                            .aggregations("cpu_avg", sa -> sa.avg(av -> av.field("system.cpu.total.norm.pct")))
                            .aggregations("cpu_max", sa -> sa.max(mx -> mx.field("system.cpu.total.norm.pct")))
                            .aggregations("mem_avg", sa -> sa.avg(av -> av.field("system.memory.actual.used.pct")))
                            .aggregations("mem_max", sa -> sa.max(mx -> mx.field("system.memory.actual.used.pct")))),
                    Void.class);

            List<NodeMetrics> nodes = new ArrayList<>();
            for (StringTermsBucket bucket : response.aggregations().get("nodes").sterms().buckets().array()) {
                String nodeName = bucket.key().stringValue();
                String nodeRole = firstTermKey(bucket.aggregations().get("role"));
                nodes.add(new NodeMetrics(nodeName, nodeRole,
                        toPercentage(bucket.aggregations().get("cpu_avg").avg().value()),
                        toPercentage(bucket.aggregations().get("cpu_max").max().value()),
                        toPercentage(bucket.aggregations().get("mem_avg").avg().value()),
                        toPercentage(bucket.aggregations().get("mem_max").max().value()),
                        bucket.docCount(),
                        containersByNode.getOrDefault(nodeName, List.of())));
            }
            // Media nodes first, then alphabetically, so the busiest role leads the report
            nodes.sort(Comparator.comparing((NodeMetrics n) -> n.isMediaNode() ? 0 : 1)
                    .thenComparing(NodeMetrics::getNodeName));
            if (nodes.isEmpty()) {
                log.info("No Metricbeat data found for the test window. Node metrics won't be reported. "
                        + "See docs/ov-monitoring.md to instrument the OpenVidu nodes.");
            } else {
                log.info("Collected metrics of {} OpenVidu node(s) from Elasticsearch", nodes.size());
            }
            return nodes;
        } catch (Exception e) {
            log.warn("Could not collect node metrics from Elasticsearch: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Per-container CPU/memory for the window, grouped by node. Returns an empty
     * map when the Metricbeat {@code docker} module isn't enabled on the nodes.
     */
    private Map<String, List<ContainerMetrics>> collectContainerMetrics(String startTime, String endTime) {
        try {
            SearchResponse<Void> response = this.client.search(s -> s
                    .index(METRICBEAT_INDEX)
                    .size(0)
                    .query(q -> q.bool(b -> b
                            .filter(f -> f.range(r -> r.date(d -> d.field(TIMESTAMP_FIELD)
                                    .gte(startTime).lte(endTime))))
                            .filter(f -> f.exists(e -> e.field("docker.cpu.total.pct")))))
                    .aggregations("nodes", a -> a
                            .terms(t -> t.field(NODE_NAME_FIELD).size(MAX_NODES))
                            .aggregations("containers", sa -> sa
                                    .terms(t -> t.field("docker.container.name").size(MAX_CONTAINERS))
                                    .aggregations("cpu_avg", ca -> ca.avg(av -> av.field("docker.cpu.total.pct")))
                                    .aggregations("cpu_max", ca -> ca.max(mx -> mx.field("docker.cpu.total.pct")))
                                    .aggregations("mem_avg",
                                            ca -> ca.avg(av -> av.field("docker.memory.usage.total"))))),
                    Void.class);

            Map<String, List<ContainerMetrics>> containersByNode = new HashMap<>();
            for (StringTermsBucket nodeBucket : response.aggregations().get("nodes").sterms().buckets().array()) {
                List<ContainerMetrics> containers = new ArrayList<>();
                for (StringTermsBucket containerBucket : nodeBucket.aggregations().get("containers").sterms()
                        .buckets().array()) {
                    containers.add(new ContainerMetrics(containerBucket.key().stringValue(),
                            orZero(containerBucket.aggregations().get("cpu_avg").avg().value()),
                            orZero(containerBucket.aggregations().get("cpu_max").max().value()),
                            orZero(containerBucket.aggregations().get("mem_avg").avg().value())));
                }
                containers.sort(Comparator.comparingDouble(ContainerMetrics::cpuAvgCores).reversed());
                containersByNode.put(nodeBucket.key().stringValue(), containers);
            }
            return containersByNode;
        } catch (Exception e) {
            log.info("Per-container metrics not available ({}). Enable the Metricbeat 'docker' module on the "
                    + "OpenVidu nodes to attribute a node's CPU to individual services.", e.getMessage());
            return Map.of();
        }
    }

    private String firstTermKey(Aggregate aggregate) {
        List<StringTermsBucket> buckets = aggregate.sterms().buckets().array();
        return buckets.isEmpty() ? "unknown" : buckets.get(0).key().stringValue();
    }

    /** Metricbeat reports normalized percentages as a 0..1 fraction. */
    private double toPercentage(Double fraction) {
        return orZero(fraction) * 100;
    }

    private double orZero(Double value) {
        return value == null || value.isNaN() || value.isInfinite() ? 0.0 : value;
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
