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
	
	private String updateWorkerUrlPolicy;
	
	private String workerAmiId;
	
	private String workerInstanceType;
	
	private String workerSecurityGroupId;
	
	private String workerInstanceRegion;
	
	private int workersNumberAtTheBeginning;
	
	private int workerMaxLoad;
	
	private int workersRumpUp;

	private String openviduUrl;

	private String openviduSecret;
	
	private String sessionNamePrefix;
	
	private String userNamePrefix;

	private int secondsToWaitBetweenParticipants;
	
	private int secondsToWaitBetweenSession;
	
	private int secondsToWaitBeforeTestFinished;
	
	private int secondsToWaitBetweenTestCases;
	
	private String elasticsearchHost;
	
	private String elasticsearchUserName;

	private String elasticsearchPassword;

	private String kibanaHost;

	public String getOpenViduUrl() {
		return this.openviduUrl;
	}

	public String getOpenViduSecret() {
		return this.openviduSecret;
	}

	public String getSessionNamePrefix() {
		return sessionNamePrefix;
	}

	public String getUserNamePrefix() {
		return userNamePrefix;
	}

	public int getSecondsToWaitBetweenParticipants() {
		return secondsToWaitBetweenParticipants;
	}

	public int getSecondsToWaitBetweenSession() {
		return secondsToWaitBetweenSession;
	}
	
	public int getSecondsToWaitBeforeTestFinished() {
		return secondsToWaitBeforeTestFinished;
	}
	
	public int getSecondsToWaitBetweenTestCases() {
		return secondsToWaitBetweenTestCases;
	}
	
	public String getKibanaHost() {
		return this.kibanaHost;
	}

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
	
	public boolean isKibanaEstablished() {
		return this.kibanaHost != null && !this.kibanaHost.isEmpty();
	}

	public List<String> getWorkerUrlList() {
		return this.workerUrlList;
	}
	
	public String getUpdateWorkerUrlPolicy() {
		return this.updateWorkerUrlPolicy;
	}
	
	public String getWorkerAmiId() {
		return this.workerAmiId;
	}
	
	public String getWorkerInstanceType() {
		return workerInstanceType;
	}

	public String getWorkerSecurityGroupId() {
		return workerSecurityGroupId;
	}
	
	public String getWorkerInstanceRegion() {
		return workerInstanceRegion;
	}

	public int getWorkersNumberAtTheBeginning() {
		return workersNumberAtTheBeginning;
	}
	
	public int getWorkersRumpUp() {
		return workersRumpUp;
	}
	
	public int getWorkerMaxLoad() {
		return workerMaxLoad;
	}

	@PostConstruct
	private void checkConfigurationProperties() {

		try {
			sessionNamePrefix = asString("SESSION_NAME_PREFIX");
			userNamePrefix = asString("USER_NAME_PREFIX");
			secondsToWaitBetweenParticipants = asInt("SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS");
			secondsToWaitBetweenSession = asInt("SECONDS_TO_WAIT_BETWEEN_SESSIONS");
			secondsToWaitBeforeTestFinished = asInt("SECONDS_TO_WAIT_BEFORE_TEST_FINISHED");
			secondsToWaitBetweenTestCases = asInt("SECONDS_TO_WAIT_BETWEEN_TEST_CASES");
			elasticsearchHost = asOptionalString("ELASTICSEARCH_HOST");
			elasticsearchUserName = asOptionalString("ELASTICSEARCH_USERNAME");
			elasticsearchPassword = asOptionalString("ELASTICSEARCH_PASSWORD");
			kibanaHost = asOptionalURL("KIBANA_HOST");
			workerUrlList = asStringList("WORKER_URL_LIST");
			workerAmiId = asString("WORKER_AMI_ID");
			workerInstanceType = asString("WORKER_INSTANCE_TYPE");
			workerSecurityGroupId = asOptionalString("WORKER_SECURITY_GROUP_ID");
			workerInstanceRegion = asString("WORKER_INSTANCE_REGION");
			workersNumberAtTheBeginning = asInt("WORKERS_NUMBER_AT_THE_BEGINNING");
			workerMaxLoad = asInt("WORKER_MAX_LOAD");
			workersRumpUp = asInt("WORKERS_RUMP_UP");
			updateWorkerUrlPolicy = asString("UPDATE_WORKER_URL_POLICY");
			openviduUrl = asString("OPENVIDU_URL");
			openviduSecret = asString("OPENVIDU_SECRET");
			
			this.printInfo();

		} catch (Exception e) {
			e.printStackTrace();
			System.exit(1);
		}

	}
	
	private void printInfo() {
		String format = "%-25s%3s%n";
		System.out.println("-------- Load Test Parameters --------");
		System.out.printf(format, "OpenVidu URL:", openviduUrl);
		System.out.printf(format, "OpenVidu SECRET:", openviduSecret);
		System.out.printf(format, "Worker List:", workerUrlList);
		System.out.printf(format, "Worker Update Url Policy:", updateWorkerUrlPolicy);
		System.out.printf(format, "Worker Ami Id:", workerAmiId);
		System.out.printf(format, "AWS instance region:", workerInstanceRegion);
		System.out.printf(format, "Worker max load:", workerMaxLoad);
		System.out.printf(format, "Worker rump up:", workersRumpUp);
		System.out.printf(format, "Session Name Prefix:", sessionNamePrefix);
		System.out.printf(format, "Username Prefix:", userNamePrefix);
		System.out.printf(format, "Seconds between users:", secondsToWaitBetweenParticipants);
		System.out.printf(format, "Seconds between sessions:", secondsToWaitBetweenSession);

		System.out.printf(format, "Kibana Host:", kibanaHost);
		System.out.printf(format, "ElasticSearch Host:", elasticsearchHost);
		System.out.printf(format, "ElasticSearch Username:", elasticsearchUserName);
		System.out.printf(format, "ElasticSearch Password:", elasticsearchPassword);
		System.out.println("-------- -------------------- --------");
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
	
	private int asInt(String property) {
		try {
			Integer integerValue = Integer.parseInt(env.getProperty(property));
			if (integerValue < 0) {
				return 0;
			}
			return integerValue;
		} catch (NumberFormatException e) {
			return 0;
		}
		
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
