package io.openvidu.loadtest.monitoring;

import java.io.IOException;
import java.net.URI;
import java.text.DecimalFormat;

import jakarta.annotation.PostConstruct;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.SortOrder;
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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;

import io.openvidu.loadtest.config.LoadTestConfig;

@Service
public class ElasticSearchClient {

    private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

    private LoadTestConfig loadTestConfig;

    private ElasticsearchClient client;

    private static DecimalFormat df2 = new DecimalFormat("#.###");

    private boolean initialized = false;

    public ElasticSearchClient(LoadTestConfig loadTestConfig) {
        this.loadTestConfig = loadTestConfig;
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

            RestClient restClient;
            if (loadTestConfig.isElasticSearchSecured()) {
                BasicCredentialsProvider credentialsProvider = new BasicCredentialsProvider();
                String esUserName = loadTestConfig.getElasticsearchUserName();
                String esPassword = loadTestConfig.getElasticsearchPassword();
                credentialsProvider.setCredentials(AuthScope.ANY,
                        new UsernamePasswordCredentials(esUserName, esPassword));
                restClient = RestClient.builder(httpHost)
                        .setHttpClientConfigCallback(httpClientBuilder -> httpClientBuilder
                                .setDefaultCredentialsProvider(credentialsProvider))
                        .build();
            } else {
                restClient = RestClient.builder(httpHost).build();
            }

            ElasticsearchTransport transport = new RestClientTransport(restClient, new JacksonJsonpMapper());
            this.client = new ElasticsearchClient(transport);

            if (doPing()) {
                this.initialized = true;
                log.info("Connection to Elasticsearch established at {}", elasticsearchHost);
            }
        } catch (Exception e) {
            log.error("Failed to initialize Elasticsearch client: {}", e.getMessage());
            log.error(
                    "If property 'ELASTICSEARCH_HOST' is defined, then it is mandatory that OpenVidu Load Test is able to connect to it");
        }
    }

    private boolean doPing() {
        boolean pingSuccess = false;
        try {
            BooleanResponse response = this.client.ping();
            pingSuccess = response.value();
        } catch (IOException e) {
            log.error("Connection to Elasticsearch failed at {} ({})", loadTestConfig.getElasticsearchHost(),
                    e.getMessage());
            log.error(
                    "If property 'ELASTICSEARCH_HOST' is defined, then it is mandatory that OpenVidu Load Test is able to connect to it");
            System.exit(1);
        }
        return pingSuccess;
    }

    public boolean isInitialized() {
        return this.initialized;
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
