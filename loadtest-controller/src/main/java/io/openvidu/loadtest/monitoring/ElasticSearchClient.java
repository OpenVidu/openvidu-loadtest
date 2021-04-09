//package io.openvidu.loadtest.monitoring;
//
//import java.io.IOException;
//import java.net.MalformedURLException;
//import java.net.URL;
//import java.sql.Timestamp;
//import java.text.DecimalFormat;
//import java.util.Arrays;
//import java.util.Date;
//import java.util.HashMap;
//import java.util.List;
//import java.util.Map;
//
//import org.apache.http.HttpHost;
//import org.apache.http.auth.AuthScope;
//import org.apache.http.auth.UsernamePasswordCredentials;
//import org.apache.http.client.CredentialsProvider;
//import org.apache.http.impl.client.BasicCredentialsProvider;
//import org.elasticsearch.action.ActionListener;
//import org.elasticsearch.action.admin.indices.create.CreateIndexRequest;
//import org.elasticsearch.action.admin.indices.create.CreateIndexResponse;
//import org.elasticsearch.action.admin.indices.mapping.put.PutMappingRequest;
//import org.elasticsearch.action.index.IndexRequest;
//import org.elasticsearch.action.index.IndexResponse;
//import org.elasticsearch.action.search.SearchRequest;
//import org.elasticsearch.action.search.SearchResponse;
//import org.elasticsearch.action.support.master.AcknowledgedResponse;
//import org.elasticsearch.client.RequestOptions;
//import org.elasticsearch.client.RestClient;
//import org.elasticsearch.client.RestClientBuilder;
//import org.elasticsearch.client.RestHighLevelClient;
//import org.elasticsearch.common.xcontent.XContentType;
//import org.elasticsearch.index.query.QueryBuilders;
//import org.elasticsearch.search.builder.SearchSourceBuilder;
//import org.elasticsearch.search.sort.SortOrder;
//import org.slf4j.Logger;
//import org.slf4j.LoggerFactory;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.stereotype.Service;
//
//import com.google.gson.JsonObject;
//
//import io.openvidu.loadtest.config.LoadTestConfig;

//@Service
//public class ElasticSearchClient {
//
//	private final static String ELASTICSEARCH_LOAD_TEST_INDEX = "loadtest";
//	private final static String ELASTICSEARCH_CUSTOM_TYPE_FIELD = "elastic_type";
//	private final static String ELASTICSEARCH_TIMESTAMP_FIELD = "timestamp";
//	private final static List<String> ELASTICSEARCH_DATE_FIELDS = Arrays.asList(ELASTICSEARCH_TIMESTAMP_FIELD);
//
//	private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);
//
//	@Autowired
//	private LoadTestConfig loadTestConfig;
//
//	private RestHighLevelClient client;
//	
//	private static DecimalFormat df2 = new DecimalFormat("#.##");
//
//	public void init() {
//		
//		URL url = serializeUrl();
//		HttpHost httpHost = new HttpHost(url.getHost(), url.getPort(), url.getProtocol());
//		RestClientBuilder restClientBuilder = RestClient.builder(httpHost);
//		boolean isELKSecured = loadTestConfig.isElasticSearchSecured();
//
//		if (isELKSecured) {
//			CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
//			String esUserName = loadTestConfig.getElasticsearchUserName();
//			String esPassword = loadTestConfig.getElasticsearchPassword();
//			credentialsProvider.setCredentials(AuthScope.ANY, new UsernamePasswordCredentials(esUserName, esPassword));
//			restClientBuilder.setHttpClientConfigCallback(
//					httpClientBuilder -> httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider));
//
//		}
//		this.client = new RestHighLevelClient(restClientBuilder);
//
//		if (doPing()) {
//			createIndex(ELASTICSEARCH_LOAD_TEST_INDEX);
//			this.logToLoadTestIndex(new LoadTestStats(10, 10).toJson());
//		}
//	}
//
//
//	private URL serializeUrl() {
//		URL url = null;
//		try {
//			url = new URL(loadTestConfig.getElasticsearchHost());
//		} catch (MalformedURLException e1) {
//			log.error("Property 'ELASTICSEARCH_HOST' is not a valid URI: {}", loadTestConfig.getElasticsearchHost());
//			System.exit(1);
//		}
//		return url;
//	}
//
//	private boolean doPing() {
//		boolean pingSuccess = false;
//		try {
//			pingSuccess = this.client.ping(RequestOptions.DEFAULT);
//		} catch (IOException e) {
//			log.error("Connection to Elasticsearch failed at {} ({})", loadTestConfig.getElasticsearchHost(),
//					e.getMessage());
//			log.error(
//					"If property 'ELASTICSEARCH_HOST' is defined, then it is mandatory that OpenVidu Load Test is able to connect to it");
//			System.exit(1);
//		}
//		return pingSuccess;
//	}
//
//
//	private void createIndex(String indexName) {
//		createElasticsearchIndex(ELASTICSEARCH_LOAD_TEST_INDEX);
//
//		PutMappingRequest request = new PutMappingRequest(ELASTICSEARCH_LOAD_TEST_INDEX);
//		Map<String, Object> jsonMap = new HashMap<>();
//		Map<String, Object> properties = new HashMap<>();
//
//		// Update time fields to be of Elasticsearch datatype date
//		Map<String, Object> message1 = new HashMap<>();
//		message1.put("type", "date");
//		message1.put("format", "epoch_millis");
//		ELASTICSEARCH_DATE_FIELDS.forEach(field -> {
//			properties.put(field, message1);
//		});
//
//		jsonMap.put("properties", properties);
//		request.source(jsonMap);
//		AcknowledgedResponse putMappingResponse;
//		try {
//			putMappingResponse = client.indices().putMapping(request, RequestOptions.DEFAULT);
//			if (putMappingResponse.isAcknowledged()) {
//				log.info("Elasticsearch index \"{}\" has been created", ELASTICSEARCH_LOAD_TEST_INDEX);
//			} else {
//				log.error("Error creating index \"{}\"", ELASTICSEARCH_LOAD_TEST_INDEX);
//				System.exit(1);
//			}
//		} catch (IOException e) {
//			e.printStackTrace();
//		}
//	}
//
//	private void logToLoadTestIndex(JsonObject object) {
//		object.addProperty(ELASTICSEARCH_CUSTOM_TYPE_FIELD, ELASTICSEARCH_LOAD_TEST_INDEX);
//		object.addProperty("type", "date");
//		object.addProperty("format", "epoch_milis");
//		IndexRequest request = new IndexRequest(ELASTICSEARCH_LOAD_TEST_INDEX);
//		request.source(object.toString(), XContentType.JSON);
//		client.indexAsync(request, RequestOptions.DEFAULT, new ActionListener<IndexResponse>() {
//			@Override
//			public void onResponse(IndexResponse indexResponse) {
//				log.info("New event of type \"{}\" sent to Elasticsearch: {}", ELASTICSEARCH_LOAD_TEST_INDEX,
//						object.toString());
//			}
//
//			@Override
//			public void onFailure(Exception e) {
//				log.error("Sending event of type \"{}\" to Elasticsearch failure: {}", ELASTICSEARCH_LOAD_TEST_INDEX,
//						e.getMessage());
//			}
//		});
//	}
//
////	private CreateIndexResponse createElasticsearchIndex(String index) {
////		log.info("Creating Elasticsearch index  \"{}\"", index);
////		CreateIndexRequest createRequest = new CreateIndexRequest(index);
////		CreateIndexResponse createIndexResponse = null;
////		try {
////			createIndexResponse = client.indices().create(createRequest, RequestOptions.DEFAULT);
////		} catch (IOException e) {
////			log.error("Error creating index \"{}\" in Elasticsearch", index);
////		}
////		return createIndexResponse;
////	}
//
//public double getCurrentOpenViduCpu() throws IOException {
//
//	SearchRequest searchRequest = new SearchRequest("openvidu");
//	SearchSourceBuilder searchSourceBuilder = new SearchSourceBuilder();
//	searchSourceBuilder.query(QueryBuilders.matchQuery("elastic_type", MONITORING_STATS));
//	searchSourceBuilder.sort("timestamp", SortOrder.DESC).size(1);
//	searchRequest.source(searchSourceBuilder);
//
//	SearchResponse searchResponse = this.client.search(searchRequest, RequestOptions.DEFAULT);
//
//	JsonObject json = jsonUtils.getJson(searchResponse.getHits().getHits()[0].getSourceAsString());
//
//	Timestamp stamp = new Timestamp(json.get("timestamp").getAsLong());
//	Date date = new Date(stamp.getTime());
//	System.out.println(date);
//
//	System.out.println("CPU USAGE " + json.get("cpu").getAsDouble());
//
//	return Double.parseDouble(df2.format(json.get("cpu").getAsDouble()));
//}
//}
