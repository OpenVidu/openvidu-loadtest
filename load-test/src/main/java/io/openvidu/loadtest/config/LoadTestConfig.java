package io.openvidu.loadtest.config;

import java.net.MalformedURLException;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.List;

import javax.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class LoadTestConfig {

	@Autowired
	private Environment env;

	private List<String> workerUrlList;

	private String openviduUrl;

	private String openviduSecret;

	private String elasticsearchUserName;

	private String elasticsearchPassword;

//	private String elasticsearchHost;
	
	private String kibanaHost;

	public String getOpenViduUrl() {
		return this.openviduUrl;
	}

	public String getOpenViduSecret() {
		return this.openviduSecret;
	}

//	public String getElasticsearchHost() {
//		return this.elasticsearchHost;
//	}
	
	public String getKibanaHost() {
		return this.kibanaHost;
	}

	public String getElasticsearchUserName() {
		return this.elasticsearchUserName;
	}

	public String getElasticsearchPassword() {
		return this.elasticsearchPassword;
	}

	public boolean isElasticSearchSecured() {
		return this.elasticsearchUserName != null && !this.elasticsearchUserName.isEmpty()
				&& this.elasticsearchPassword != null && !this.elasticsearchPassword.isEmpty();
	}
	
	public boolean isKibanaEstablished() {
		return this.kibanaHost != null && !this.kibanaHost.isEmpty();
	}

	public List<String> getWorkerUrlList() {
		return this.workerUrlList;
	}

	@PostConstruct
	private void checkConfigurationProperties() {

		try {
//			elasticsearchHost = asOptionalURL("ELASTICSEARCH_HOST");
			elasticsearchUserName = asOptionalString("ELASTICSEARCH_USERNAME");
			elasticsearchPassword = asOptionalString("ELASTICSEARCH_PASSWORD");
			kibanaHost = asOptionalURL("KIBANA_HOST");
			workerUrlList = asStringList("WORKER_URL_LIST");
			openviduUrl = asString("OPENVIDU_URL");
			openviduSecret = asString("OPENVIDU_SECRET");

		} catch (Exception e) {
			e.printStackTrace();
			System.exit(1);
		}

	}

	// -------------------------------------------------------
	// Format Checkers
	// -------------------------------------------------------

	private String asOptionalURL(String property) throws Exception {
		String url = env.getProperty(property);
		try {
			if (!url.isEmpty()) {
				checkUrl(url);
				return url;
			}
			return "";
		} catch (Exception e) {
			e.printStackTrace();
			throw new Exception(property + " is wrong." + e);
		}
	}

	private String asString(String property) throws Exception {
		String value = env.getProperty(property);
		if (value == null || value.isEmpty()) {
			throw new Exception(property + " is required.");
		}
		return value;
	}

	private List<String> asStringList(String property) throws Exception {
		List<String> value = env.getProperty(property, List.class);
		if (value == null || value.isEmpty()) {
			throw new Exception(property + " is required.");
		}

		return value;
	}

	private String asOptionalString(String property) {
		return env.getProperty(property);
	}

	private void checkUrl(String url) throws Exception {
		try {
			new URL(url).toURI();
		} catch (MalformedURLException | URISyntaxException e) {
			throw new Exception("String '" + url + "' has not a valid URL format: " + e.getMessage());
		}
	}

}
