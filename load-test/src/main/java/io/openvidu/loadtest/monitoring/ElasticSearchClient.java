package io.openvidu.loadtest.monitoring;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.client.CredentialsProvider;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class ElasticSearchClient {

//	private final static String ELASTICSEARCH_LOAD_TEST_INDEX = "loadtest";
//	private final static String ELASTICSEARCH_CUSTOM_TYPE_FIELD = "elastic_type";
//	private final static String ELASTICSEARCH_TIMESTAMP_FIELD = "timestamp";
//	private final static List<String> ELASTICSEARCH_DATE_FIELDS = Arrays.asList(ELASTICSEARCH_TIMESTAMP_FIELD);
	private final String API_IMPORT_OBJECTS = "/api/saved_objects/_import?overwrite=true";
//	private final String API_FIND_DASHBOARD = "/api/saved_objects/_find?type=dashboard&search_fields=title&search=";

	private static final int HTTP_STATUS_OK = 200;


	private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private JsonUtils jsonUtils;

	@Autowired
	private CustomHttpClient httpClient;

	@Autowired
	private ResourceLoader resourceLoader;

	private String kibanaHost;
	private RestHighLevelClient client;
	
//	private static DecimalFormat df2 = new DecimalFormat("#.##");

	public void importLoadTestDashboard() {
		URL url = serializeUrl();
		HttpHost httpHost = new HttpHost(url.getHost(), url.getPort(), url.getProtocol());
		RestClientBuilder restClientBuilder = RestClient.builder(httpHost);
		boolean isELKSecured = loadTestConfig.isElasticSearchSecured();

		if (isELKSecured) {
			CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
			String esUserName = loadTestConfig.getElasticsearchUserName();
			String esPassword = loadTestConfig.getElasticsearchPassword();
			credentialsProvider.setCredentials(AuthScope.ANY, new UsernamePasswordCredentials(esUserName, esPassword));
			restClientBuilder.setHttpClientConfigCallback(
					httpClientBuilder -> httpClientBuilder.setDefaultCredentialsProvider(credentialsProvider));

		}
		this.client = new RestHighLevelClient(restClientBuilder);

		if (doPing()) {
//			createIndex(ELASTICSEARCH_LOAD_TEST_INDEX);
//			this.logToLoadTestIndex(new LoadTestStats(10, 10).toJson());
			this.importKibanaDashboards();
		}
	}

	private void importKibanaDashboards() {
		try {
			this.kibanaHost = loadTestConfig.getKibanaHost().replaceAll("/$", "");
			log.info("Importing Kibana JSON file with saved objects from resources directory");
			Resource resource = resourceLoader.getResource("classpath:loadtest.ndjson");
			importSavedObjects(resource.getFile());
		} catch (Exception e) {
			log.warn("Can't import dashboard to Kibana at {}", this.kibanaHost);
			System.out.println(e.getMessage());
		}
	}

	private void importSavedObjects(File file) throws IOException {
		final String URL = this.kibanaHost + API_IMPORT_OBJECTS;
		HttpResponse<String> response = null;
		Map<String, String> headers = new HashMap<String, String>();

		// Basic auth header
		String esUserName = loadTestConfig.getElasticsearchUserName();
		String esPassword = loadTestConfig.getElasticsearchPassword();
		boolean securityEnabled = loadTestConfig.isElasticSearchSecured();
		if (securityEnabled) {
			headers.put("Authorization", getBasicAuth(esUserName, esPassword));
		}
		headers.put("kbn-xsrf", "true");

		try {
			response = this.httpClient.sendPost(URL, null, file, headers);
			this.processKibanaResponse(response);
			
		} catch (InterruptedException e) {
			log.warn("InterruptedException when reaching Kibana REST API with method POST at path {}: {}", URL, e.getMessage());
			e.printStackTrace();
		}
	}

	private URL serializeUrl() {
		URL url = null;
		try {
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

	private String getBasicAuth(String username, String password) {
		return "Basic " + Base64.getEncoder().encodeToString((username + ":" + password).getBytes());
	}
	
	private void processKibanaResponse(HttpResponse<String> response) {
		if(response.statusCode()  == HTTP_STATUS_OK) {
			log.info("Kibana dashboards successfully imported");
		} else {
			log.error("Kibana response status {}. {}", response.statusCode(), response.body());
		}
	}

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
//	private CreateIndexResponse createElasticsearchIndex(String index) {
//		log.info("Creating Elasticsearch index  \"{}\"", index);
//		CreateIndexRequest createRequest = new CreateIndexRequest(index);
//		CreateIndexResponse createIndexResponse = null;
//		try {
//			createIndexResponse = client.indices().create(createRequest, RequestOptions.DEFAULT);
//		} catch (IOException e) {
//			log.error("Error creating index \"{}\" in Elasticsearch", index);
//		}
//		return createIndexResponse;
//	}

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
}
