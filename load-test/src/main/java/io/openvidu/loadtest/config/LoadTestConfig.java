package io.openvidu.loadtest.config;

import java.net.MalformedURLException;
import java.net.URISyntaxException;
import java.net.URL;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;


@Component
public class LoadTestConfig {
	
	private static final Logger log = LoggerFactory.getLogger(LoadTestConfig.class);

	@Autowired
	private Environment env;

	private String elasticsearchUserName;

	private String elasticsearchPassword;

	private String elasticsearchHost;

	public String getElasticsearchHost() {
		return this.elasticsearchHost;
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

	@PostConstruct
	private void checkConfigurationProperties() {

		try {
			elasticsearchHost = asURL("ELASTICSEARCH_HOST");
			elasticsearchUserName = asString("ELASTICSEARCH_USERNAME");

		} catch (Exception e) {
			e.printStackTrace();
			System.exit(1);
		}
		
		elasticsearchPassword = asOptionalString("ELASTICSEARCH_PASSWORD");

	}
	
	

	// -------------------------------------------------------
	// Format Checkers
	// -------------------------------------------------------

	private String asURL(String property) throws Exception {
		String url = env.getProperty(property);
		try {
			if (!url.isEmpty()) {
				checkUrl(url);
				return url;
			}
			throw new Exception(property +  " is required.");
		} catch (Exception e) {
			e.printStackTrace();
			throw new Exception(property +  " is wrong." + e);
		}
	}
	
	private String asString(String property) throws Exception {
		String value = env.getProperty(property);
		if(value == null || value.isEmpty()) {
			throw new Exception(property +  " is required.");
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
