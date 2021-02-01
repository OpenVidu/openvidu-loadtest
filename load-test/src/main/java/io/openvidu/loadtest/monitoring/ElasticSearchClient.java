package io.openvidu.loadtest.monitoring;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.net.URL;
import java.text.DecimalFormat;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

import javax.annotation.PostConstruct;

import org.apache.http.HttpEntity;
import org.apache.http.HttpHost;
import org.apache.http.HttpResponse;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.client.CookieStore;
import org.apache.http.client.CredentialsProvider;
import org.apache.http.client.config.CookieSpecs;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.client.protocol.HttpClientContext;
import org.apache.http.conn.HttpHostConnectException;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.mime.MultipartEntityBuilder;
import org.apache.http.entity.mime.content.FileBody;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
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
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class ElasticSearchClient {
	
	public final static String ELASTICSEARCH_LOAD_TEST_INDEX = "loadtest";
	public final static String ELASTICSEARCH_CUSTOM_TYPE_FIELD = "elastic_type";
	public final static String ELASTICSEARCH_TIMESTAMP_FIELD = "timestamp";
	public final static List<String> ELASTICSEARCH_DATE_FIELDS = Arrays.asList(ELASTICSEARCH_TIMESTAMP_FIELD);
	private final String API_IMPORT_OBJECTS = "/api/saved_objects/_import?overwrite=true";
	private final String API_FIND_DASHBOARD = "/api/saved_objects/_find?type=dashboard&search_fields=title&search=";
	
	private final static int KIBANA_TIMEOUT = 30000;

	private static final Logger log = LoggerFactory.getLogger(ElasticSearchClient.class);

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private JsonUtils jsonUtils;
	
	@Autowired
	private ResourceLoader resourceLoader;
	
	private String kibanaHost;
	private CookieStore cookieStore;

	private RestHighLevelClient client;
	private static DecimalFormat df2 = new DecimalFormat("#.##");

	@PostConstruct
	private void init() {
		URL url = serializeUrl();
		HttpHost httpHost = new HttpHost(url.getHost(), url.getPort(), url.getProtocol());
		RestClientBuilder restClientBuilder = RestClient.builder(httpHost);
		boolean isELKSecured = loadTestConfig.isElasticSearchSecured();

		System.out.println(url.getHost() + " " + url.getPort() + " " + url.getProtocol());
		if (isELKSecured) {
			CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
			String esUserName = loadTestConfig.getElasticsearchUserName();
			String esPassword = loadTestConfig.getElasticsearchPassword();
			System.out.println("USER " + esUserName);
			System.out.println("PASS " + esPassword);

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
//		log.info("ElasticSearch connected");

	}
	
	private void importKibanaDashboards() {
		try {
			this.kibanaHost = loadTestConfig.getKibanaHost().replaceAll("/$", "");
//			this.isSecuredOpenDistro = this.isSecuredOpenDistro();
			log.info("Importing Kibana JSON file with saved objects from JAR resources");
			File objects = getKibanaObjectsFile();
			importSavedObjects(objects);
		} catch (Exception e) {
			log.warn("Can't import dashboard to Kibana at {}", this.kibanaHost);
			System.out.println(e.getMessage());
		}
	}
	
	private File getKibanaObjectsFile() throws IOException {
		Resource resource = resourceLoader.getResource("classpath:loadtest.ndjson");
		InputStream in = null;
		try {
			in = resource.getInputStream();
		} catch (IOException e) {
			log.error("Error reading Kibana JSON file from JAR resources: {}", e.getMessage());
		}

		File tempFile = File.createTempFile(String.valueOf(in.hashCode()), ".ndjson");
		tempFile.deleteOnExit();

		try (FileOutputStream out = new FileOutputStream(tempFile)) {
			byte[] buffer = new byte[1024];
			int bytesRead;
			while ((bytesRead = in.read(buffer)) != -1) {
				out.write(buffer, 0, bytesRead);
			}
		}
		return tempFile;
	}
	
	private void importSavedObjects(File file) throws IOException {
		final String PATH = this.kibanaHost + API_IMPORT_OBJECTS;
		CloseableHttpClient httpclient = null;
		CloseableHttpResponse response = null;
		ByteArrayOutputStream stream = new ByteArrayOutputStream();
		InputStream inputStream = null;
		try {

			HttpPost httpPost = new HttpPost(PATH);
			httpPost.setConfig(
					RequestConfig.custom().setConnectTimeout(KIBANA_TIMEOUT).setSocketTimeout(KIBANA_TIMEOUT)
							.setCookieSpec(CookieSpecs.STANDARD).build());
			httpPost.addHeader("kbn-xsrf", "true");

			// Basic auth header
			String esUserName = loadTestConfig.getElasticsearchUserName();
			String esPassword = loadTestConfig.getElasticsearchPassword();
			boolean securityEnabled = loadTestConfig.isElasticSearchSecured();
//			if (!this.isSecuredOpenDistro && securityEnabled) {
				httpPost.addHeader("Authorization", getBasicAuth(esUserName, esPassword));
//			}

			FileBody fileBody = new FileBody(file, ContentType.DEFAULT_BINARY);
			HttpEntity entity = MultipartEntityBuilder.create().addPart("file", fileBody)
					.setContentType(ContentType.MULTIPART_FORM_DATA).build();
			httpPost.setEntity(entity);
			httpclient = HttpClients.custom().setDefaultCookieStore(cookieStore).build();
			HttpClientContext context = HttpClientContext.create();
			response = httpclient.execute(httpPost, context);
			entity.writeTo(stream);
			parseRestResult(response, "POST " + PATH, inputStream);
			cookieStore = context.getCookieStore();
			log.info("Kibana dashboards successfully imported");
		} catch (HttpHostConnectException e) {
			log.warn("Kibana is not accessible at {}: {}", e.getHost().toURI(), e.getMessage());
			throw e;
		} catch (IOException e) {
			log.warn("IOException when reaching Kibana REST API with method POST at path {}: {}", PATH, e.getMessage());
			throw e;
		} finally {
			if (stream != null) {
				stream.close();
			}
			if (inputStream != null) {
				inputStream.close();
			}
			if (response != null) {
				response.close();
			}
			if (httpclient != null) {
				httpclient.close();
			}
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
//			// TODO Auto-generated catch block
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
	
	private String parseRestResult(HttpResponse response, String method, InputStream stream) throws IOException {
		StringBuilder result = new StringBuilder();
		int status = response.getStatusLine().getStatusCode();
		switch (status) {
		case 200:
			stream = response.getEntity().getContent();
			break;
		default:
			log.warn("Kibana returned an unexpected response to {}: {}", method, status);
		}
		// Read content from response to Kibana API
		BufferedReader rd = new BufferedReader(new InputStreamReader(stream));
		String line;
		try {
			while ((line = rd.readLine()) != null) {
				result.append(line);
			}
		} catch (IOException e) {
			log.error(e.getMessage());
		} finally {
			if (rd != null) {
				rd.close();
			}
		}
		return result.toString();
	}
	
	private String getBasicAuth(String username, String password) {
		return "Basic " + Base64.getEncoder().encodeToString((username + ":" + password).getBytes());
	}


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
