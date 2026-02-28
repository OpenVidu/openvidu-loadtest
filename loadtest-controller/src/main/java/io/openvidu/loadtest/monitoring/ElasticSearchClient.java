package io.openvidu.loadtest.monitoring;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.text.DecimalFormat;

import jakarta.annotation.PostConstruct;

import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.impl.client.BasicCredentialsProvider;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.ElasticsearchTransport;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;

import io.openvidu.loadtest.config.LoadTestConfig;

@Service
public class ElasticSearchClient {

	private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

	@Autowired
	private LoadTestConfig loadTestConfig;

	private ElasticsearchClient client;
	private ElasticsearchTransport transport;

	private static DecimalFormat df2 = new DecimalFormat("#.###");

	private boolean initialized = false;

	@PostConstruct
	public void init() {

		URL url = serializeUrl();
		if (url != null) {

			HttpHost httpHost = new HttpHost(url.getHost(), url.getPort(), url.getProtocol());
			RestClientBuilder restClientBuilder = RestClient.builder(httpHost);
			if (url.getPath() != null && !url.getPath().isEmpty()) {
				restClientBuilder.setPathPrefix(url.getPath());
			}
			boolean isELKSecured = loadTestConfig.isElasticSearchSecured();

			if (isELKSecured) {
				BasicCredentialsProvider credentialsProvider = new BasicCredentialsProvider();
				String esUserName = loadTestConfig.getElasticsearchUserName();
				String esPassword = loadTestConfig.getElasticsearchPassword();
				credentialsProvider.setCredentials(AuthScope.ANY,
						new UsernamePasswordCredentials(esUserName, esPassword));
				restClientBuilder.setHttpClientConfigCallback(
						httpClientBuilder -> httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider));

			}
			RestClient restClient = restClientBuilder.build();
			this.transport = new RestClientTransport(restClient, new JacksonJsonpMapper());
			this.client = new ElasticsearchClient(transport);

			if (doPing()) {
				this.initialized = true;
				log.info("Connection to Elasticsearch established at {}", loadTestConfig.getElasticsearchHost());
			}
		} else {
			log.info("Elasticsearch client not initialized");
		}
	}

	private URL serializeUrl() {
		URL url = null;
		try {
			if (loadTestConfig.getElasticsearchHost().equals("")) {
				log.warn("Property 'ELASTICSEARCH_HOST' is not defined");
				return null;
			}
			url = new URL(loadTestConfig.getElasticsearchHost());
		} catch (MalformedURLException e1) {
			log.error("Property 'ELASTICSEARCH_HOST' is not a valid URI: {}", loadTestConfig.getElasticsearchHost());
			System.exit(1);
		}
		return url;
	}

	private boolean doPing() {
		boolean pingSuccess = false;
		try {
			pingSuccess = this.client.ping().value();
		} catch (IOException e) {
			log.error("Connection to Elasticsearch failed at {} ({})", loadTestConfig.getElasticsearchHost(),
					e.getMessage());
			log.error(
					"If property 'ELASTICSEARCH_HOST' is defined, then it is mandatory that OpenVidu Load Test is able to connect to it");
			System.exit(1);
		}
		return pingSuccess;
	}

	// private double getCurrentOpenViduCpu() throws IOException {
	//
	// SearchRequest searchRequest = new SearchRequest("openvidu");
	// SearchSourceBuilder searchSourceBuilder = new SearchSourceBuilder();
	// searchSourceBuilder.query(QueryBuilders.matchQuery("elastic_type",
	// MONITORING_STATS));
	// searchSourceBuilder.sort("timestamp", SortOrder.DESC).size(1);
	// searchRequest.source(searchSourceBuilder);
	//
	// SearchResponse searchResponse = this.client.search(searchRequest,
	// RequestOptions.DEFAULT);
	//
	// JsonObject json =
	// jsonUtils.getJson(searchResponse.getHits().getHits()[0].getSourceAsString());
	//
	// Timestamp stamp = new Timestamp(json.get("timestamp").getAsLong());
	// Date date = new Date(stamp.getTime());
	// System.out.println(date);
	//
	// System.out.println("CPU USAGE " + json.get("cpu").getAsDouble());
	//
	// return Double.parseDouble(df2.format(json.get("cpu").getAsDouble()));
	// }
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
									.must(m -> m.exists(e -> e.field("system.cpu")))
							)
					)
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
