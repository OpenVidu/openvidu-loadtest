package io.openvidu.loadtest.monitoring;

import java.io.File;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.utils.CustomHttpClient;

/**
 * @author Carlos Santos
 *
 */

@Service
public class KibanaClient {

	private final String API_IMPORT_OBJECTS = "/api/saved_objects/_import?overwrite=true";
//	private final String API_FIND_DASHBOARD = "/api/saved_objects/_find?type=dashboard&search_fields=title&search=";

	private static final int HTTP_STATUS_OK = 200;

	private static final Logger log = LoggerFactory.getLogger(KibanaClient.class);

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private CustomHttpClient httpClient;

	@Autowired
	private ResourceLoader resourceLoader;

	private String kibanaHost;

	public void importDashboards() {
		if (this.loadTestConfig.isKibanaEstablished()) {

			try {
				this.kibanaHost = loadTestConfig.getKibanaHost().replaceAll("/$", "");
				log.info("Importing Kibana JSON file with saved objects from resources directory");
				Resource resource = resourceLoader.getResource("classpath:loadtest.ndjson");
				importSavedObjects(resource.getFile());
			} catch (Exception e) {
				log.warn("Can't import dashboard to Kibana at {}", this.kibanaHost);
				System.out.println(e.getMessage());
			}
			return;
		}
		log.warn("Kibana Host parameter is empty. Dashboard won't be imported.");
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
			log.warn("InterruptedException when reaching Kibana REST API with method POST at path {}: {}", URL,
					e.getMessage());
			e.printStackTrace();
		}
	}

	private String getBasicAuth(String username, String password) {
		return "Basic " + Base64.getEncoder().encodeToString((username + ":" + password).getBytes());
	}

	private void processKibanaResponse(HttpResponse<String> response) {
		if (response.statusCode() == HTTP_STATUS_OK) {
			log.info("Kibana dashboards successfully imported");
		} else {
			log.error("Kibana response status {}. {}", response.statusCode(), response.body());
		}
	}

}
