package io.openvidu.loadtest.config;

import java.net.MalformedURLException;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.ArrayList;
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

	private String workerAmiId;

	private String workerInstanceType;
	
	private String workerInstanceKeyPair;

	private String workerSecurityGroupId;

	private String workerInstanceRegion;

	private int workersNumberAtTheBeginning;

	private int recordingWorkersNumberAtTheBeginning;

	private int workerMaxLoad;

	private int workersRumpUp;

	private boolean terminateWorkers;

	private String openviduUrl;

	private String openviduSecret;

	private String sessionNamePrefix;

	private String userNamePrefix;

	private int secondsToWaitBetweenParticipants;

	private int secondsToWaitBetweenSession;

	private int secondsToWaitBeforeTestFinished;

	private int secondsToWaitBetweenTestCases;

	private boolean manualParticipantsAllocation;

	private int sessionsPerWorker;
	
	private double medianodeLoadForStartRecording;
	
	private int recordingSessionGroup;

	private String elasticsearchHost;

	private String elasticsearchUserName;

	private String elasticsearchPassword;

	private String kibanaHost;

	private String awsSecretAccessKey;
	
	private String awsAccessKey;
	
	private String s3bucketName;
	
	private boolean retryMode;
	
	private int retryTimes;

	private boolean qoeAnalysis;
	
	public String getOpenViduUrl() {
		return this.openviduUrl;
	}

	public String getAwsSecretAccessKey() {
		return awsSecretAccessKey;
	}

	public String getAwsAccessKey() {
		return awsAccessKey;
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

	public String getWorkerInstanceKeyPair() {
		return workerInstanceKeyPair;
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

	public boolean isManualParticipantsAllocation() {
		return manualParticipantsAllocation;
	}

	public int getSessionsPerWorker() {
		return sessionsPerWorker;
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
	
    public int getRecordingWorkersNumberAtTheBeginning() {
		return recordingWorkersNumberAtTheBeginning;
    }

	public int getWorkersRumpUp() {
		return workersRumpUp;
	}

	public int getWorkerMaxLoad() {
		return workerMaxLoad;
	}
	
	public double getMedianodeLoadForRecording() {
		return medianodeLoadForStartRecording;
	}
	
	public int getRecordingSessionGroup() {
		return recordingSessionGroup;
	}
	
	public String getS3BucketName() {
		return s3bucketName;
	}

	public boolean isTerminateWorkers() {
		return terminateWorkers;
	}
	
	public boolean isRetryMode() {
		return retryMode;
	}

	public int getRetryTimes() {
		return retryTimes;
	}

	public boolean isQoeAnalysis() {
		return qoeAnalysis;
	}
	
	@PostConstruct
	private void checkConfigurationProperties() {

		try {
			openviduUrl = asString("OPENVIDU_URL");
			openviduSecret = asString("OPENVIDU_SECRET");
			sessionNamePrefix = asString("SESSION_NAME_PREFIX");
			userNamePrefix = asString("USER_NAME_PREFIX");
			secondsToWaitBetweenParticipants = asInt("SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS");
			secondsToWaitBetweenSession = asInt("SECONDS_TO_WAIT_BETWEEN_SESSIONS");
			secondsToWaitBeforeTestFinished = asInt("SECONDS_TO_WAIT_BEFORE_TEST_FINISHED");
			secondsToWaitBetweenTestCases = asInt("SECONDS_TO_WAIT_BETWEEN_TEST_CASES");
			manualParticipantsAllocation = asBoolean("MANUAL_PARTICIPANTS_ALLOCATION");
			sessionsPerWorker= asInt("SESSIONS_PER_WORKER");
			elasticsearchHost = asOptionalString("ELASTICSEARCH_HOST");
			elasticsearchUserName = asOptionalString("ELASTICSEARCH_USERNAME");
			elasticsearchPassword = asOptionalString("ELASTICSEARCH_PASSWORD");
			kibanaHost = asOptionalURL("KIBANA_HOST");
			workerUrlList = asOptionalStringList("WORKER_URL_LIST");
			workerAmiId = asOptionalString("WORKER_AMI_ID");
			workerInstanceKeyPair = asOptionalString("WORKER_INSTANCE_KEY_PAIR_NAME");
			workerInstanceType = asOptionalString("WORKER_INSTANCE_TYPE");
			workerSecurityGroupId = asOptionalString("WORKER_SECURITY_GROUP_ID");
			workerInstanceRegion = asOptionalString("WORKER_INSTANCE_REGION");
			workersNumberAtTheBeginning = asInt("WORKERS_NUMBER_AT_THE_BEGINNING");
			recordingWorkersNumberAtTheBeginning = asInt("RECORDING_WORKERS_AT_THE_BEGINNING");
			workerMaxLoad = asInt("WORKER_MAX_LOAD");
			workersRumpUp = asInt("WORKERS_RUMP_UP");
			medianodeLoadForStartRecording = asDouble("MEDIANODE_LOAD_FOR_START_RECORDING");
			recordingSessionGroup = asInt("RECORDING_SESSION_GRUPED_BY");
			terminateWorkers = asBoolean("TERMINATE_WORKERS");
			awsSecretAccessKey = asOptionalString("AWS_SECRET_ACCESS_KEY");
			awsAccessKey = asOptionalString("AWS_ACCESS_KEY");
			s3bucketName = asOptionalString("S3_BUCKET_NAME");
			retryMode = asBoolean("RETRY_MODE");
			retryTimes = asInt("RETRY_TIMES");
			qoeAnalysis = asBoolean("QOE_ANALYSIS");
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
		System.out.printf(format, "Session Name Prefix:", sessionNamePrefix);
		System.out.printf(format, "Username Prefix:", userNamePrefix);
		System.out.printf(format, "Seconds between users:", secondsToWaitBetweenParticipants);
		System.out.printf(format, "Seconds between sessions:", secondsToWaitBetweenSession);
		System.out.printf(format, "Is manual participant allocation:", manualParticipantsAllocation);
		if(manualParticipantsAllocation) {
			if(sessionsPerWorker > 0) {
				System.out.printf(format, "Sessions per worker:", sessionsPerWorker);
			} else {
				System.err.printf(format, "sessionsPerWorker is not defined");
				System.exit(1);
			}
		}
		
		if(retryMode) {
			System.out.printf(format, "Controller started in RETRY MODE");
			if(retryTimes < 1) {
				System.err.printf(format, "Retry times is undefined");
				System.exit(1);
			}
		}
		
		System.out.printf("\n");
		System.out.printf("--- WORKER PARAMETERS ---");
		System.out.printf("\n");
		
		if(workerUrlList.size() > 0) {
			System.out.printf("RUNNING TESTS IN DEVELOPMENT (LOCAL)");
			System.out.printf("\n");
			System.out.printf(format, "Worker List:", workerUrlList);
		} else {
			System.out.printf("RUNNING TESTS IN PRODUCTION (AWS)");
			System.out.printf("\n");

			System.out.printf(format, "Worker Ami Id:", workerAmiId);
			System.out.printf(format, "Worker instance type:", workerInstanceType);
			System.out.printf(format, "Worker max load:", workerMaxLoad);
			System.out.printf(format, "Workers at the beginning:", workersNumberAtTheBeginning);
			System.out.printf(format, "Recording Workers at the beginning:", recordingWorkersNumberAtTheBeginning);
			System.out.printf(format, "Worker rump up:", workersRumpUp);
			System.out.printf(format, "AWS instance region:", workerInstanceRegion);
		}
		
		if(medianodeLoadForStartRecording > 0) {
			System.out.printf(format, "Start recording when medianode CPU is over:", medianodeLoadForStartRecording);
		}
		if (recordingSessionGroup > 0) {
			System.out.printf(format, "Recording starts each :", recordingSessionGroup + " session(s)");
			if(s3bucketName.isBlank()) {
				System.err.printf(format, "S3 Bucket Name is not defined");
				System.exit(1);
			}
		}

		System.out.printf("\n");
		System.out.printf("--- MONITORING PARAMETERS ---");
		System.out.printf("\n");

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

	private List<String> asOptionalStringList(String property) {
		try {
			return this.asStringList(property);
		} catch (Exception e) {
			return new ArrayList<String>();
		}
	}

	private int asInt(String property) {
		try {
			Integer integerValue = Integer.parseInt(env.getProperty(property));
			if (integerValue < 0) {
				return 0;
			}
			return integerValue;
		} catch (NumberFormatException e) {
			return -1;
		}

	}
	
	private double asDouble(String property) {
		try {
			Double doubleValue = Double.parseDouble(env.getProperty(property));
			if (doubleValue < 0) {
				return 0.0;
			}
			return doubleValue;
		} catch (NumberFormatException e) {
			return 0.0;
		}

	}

	private String asOptionalString(String property) {
		return env.getProperty(property);
	}

	private boolean asBoolean(String property) {
		try {
			return Boolean.parseBoolean(env.getProperty(property));
		} catch (Exception e) {
			return false;
		}
	}

	private void checkUrl(String url) throws Exception {
		try {
			new URL(url).toURI();
		} catch (MalformedURLException | URISyntaxException e) {
			throw new Exception("String '" + url + "' has not a valid URL format: " + e.getMessage());
		}
	}

}
