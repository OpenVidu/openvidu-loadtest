package io.openvidu.loadtest.monitoring;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.text.DecimalFormat;

import javax.annotation.PostConstruct;

import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.client.CredentialsProvider;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.elasticsearch.action.search.SearchRequest;
import org.elasticsearch.action.search.SearchResponse;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.index.query.BoolQueryBuilder;
import org.elasticsearch.index.query.ExistsQueryBuilder;
import org.elasticsearch.index.query.MatchQueryBuilder;
import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.search.builder.SearchSourceBuilder;
import org.elasticsearch.search.sort.SortOrder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class ElasticSearchClient {

	private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private JsonUtils jsonUtils;

	private RestHighLevelClient client;

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
				CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
				String esUserName = loadTestConfig.getElasticsearchUserName();
				String esPassword = loadTestConfig.getElasticsearchPassword();
				credentialsProvider.setCredentials(AuthScope.ANY,
						new UsernamePasswordCredentials(esUserName, esPassword));
				restClientBuilder.setHttpClientConfigCallback(
						httpClientBuilder -> httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider));

			}
			this.client = new RestHighLevelClient(restClientBuilder);

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
			pingSuccess = this.client.ping(RequestOptions.DEFAULT);
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

		SearchRequest searchRequest = new SearchRequest("metricbeat*");
		SearchSourceBuilder searchSourceBuilder = new SearchSourceBuilder();

		BoolQueryBuilder queryBuilder = QueryBuilders.boolQuery();

		MatchQueryBuilder medianodeMatcher = QueryBuilders.matchQuery("fields.node_role", "medianode");
		ExistsQueryBuilder cpuMatcher = QueryBuilders.existsQuery("system.cpu");

		queryBuilder.must(medianodeMatcher);
		queryBuilder.must(cpuMatcher);

		searchSourceBuilder.query(queryBuilder);
		searchSourceBuilder.sort("@timestamp", SortOrder.DESC).size(1);
		searchRequest.source(searchSourceBuilder);

		SearchResponse searchResponse;
		try {
			searchResponse = this.client.search(searchRequest, RequestOptions.DEFAULT);
			JsonObject json = jsonUtils.getJson(searchResponse.getHits().getHits()[0].getSourceAsString());

			double cpu = json.get("system").getAsJsonObject().get("cpu").getAsJsonObject().get("total")
					.getAsJsonObject().get("norm").getAsJsonObject().get("pct").getAsDouble();
			log.info("Media node CPU is {}", cpu * 100);
			return Double.parseDouble(df2.format(cpu * 100));

		} catch (IOException e) {
			log.error(e.getMessage());
			e.printStackTrace();
			return 0.0;
		}
	}
}
