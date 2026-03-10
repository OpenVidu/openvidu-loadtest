package io.openvidu.loadtest.config;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;

public abstract class LoadTestConfig {

    private static final Logger log = LoggerFactory.getLogger(LoadTestConfig.class);

    private Environment env;

    protected LoadTestConfig(Environment env) {
        this.env = env;
    }

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

    private String sessionNamePrefix;

    private String userNamePrefix;

    private int secondsToWaitBetweenParticipants;

    private int secondsToWaitBetweenSession;

    private int secondsToWaitBeforeTestFinished;

    private int secondsToWaitBetweenTestCases;

    private boolean manualParticipantsAllocation;

    private int usersPerWorker;

    private double medianodeLoadForStartRecording;

    private int recordingSessionGroup;

    private String elasticsearchHost;

    private String elasticsearchUserName;

    private String elasticsearchPassword;

    private String kibanaHost;

    private String awsSecretAccessKey;

    private String awsAccessKey;

    private String s3bucketName;

    private String s3Region;

    private String s3Host;

    private String s3HostAccessKey;

    private String s3HostSecretKey;

    private boolean retryMode;

    private int retryTimes;

    private boolean qoeAnalysisRecordings;

    private boolean qoeAnalysisInSitu;

    private int paddingDuration;

    private int fragmentDuration;

    private String videoType;

    private int videoHeight;

    private int videoWidth;

    private int videoFps;

    private String videoUrl;

    private String audioUrl;

    private boolean debugVnc;

    private int batchMaxRequests;

    private boolean batches;

    private boolean waitCompletion;

    private String workerAvailabilityZone;

    private boolean forceContinue;

    public boolean isWaitCompletion() {
        return waitCompletion;
    }

    public boolean isBatches() {
        return batches;
    }

    public String getOpenViduUrl() {
        return this.openviduUrl;
    }

    public String getAwsSecretAccessKey() {
        return awsSecretAccessKey;
    }

    public String getAwsAccessKey() {
        return awsAccessKey;
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

    public int getUsersPerWorker() {
        return usersPerWorker;
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

    public boolean isQoeAnalysisRecordings() {
        return qoeAnalysisRecordings;
    }

    public boolean isQoeAnalysisInSitu() {
        return qoeAnalysisInSitu;
    }

    public int getPaddingDuration() {
        return paddingDuration;
    }

    public int getFragmentDuration() {
        return fragmentDuration;
    }

    public String getVideoType() {
        return videoType;
    }

    public int getVideoHeight() {
        return videoHeight;
    }

    public int getVideoWidth() {
        return videoWidth;
    }

    public int getVideoFps() {
        return videoFps;
    }

    public String getVideoUrl() {
        return videoUrl;
    }

    public String getAudioUrl() {
        return audioUrl;
    }

    public String getS3Region() {
        return s3Region;
    }

    public String getS3Host() {
        return s3Host;
    }

    public String getS3HostAccessKey() {
        return s3HostAccessKey;
    }

    public String getS3HostSecretKey() {
        return s3HostSecretKey;
    }

    public boolean isDebugVnc() {
        return this.debugVnc;
    }

    public int getBatchMaxRequests() {
        return this.batchMaxRequests;
    }

    public String getWorkerAvailabilityZone() {
        return workerAvailabilityZone;
    }

    public boolean isForceContinue() {
        return forceContinue;
    }

    protected void checkConfigurationProperties() {
        try {
            openviduUrl = asString("OPENVIDU_URL");
            openviduUrl = openviduUrl.replaceAll("/$", "");
            sessionNamePrefix = asString("SESSION_NAME_PREFIX");
            userNamePrefix = asString("USER_NAME_PREFIX");
            secondsToWaitBetweenParticipants = asInt("SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS");
            secondsToWaitBetweenSession = asInt("SECONDS_TO_WAIT_BETWEEN_SESSIONS");
            secondsToWaitBeforeTestFinished = asInt("SECONDS_TO_WAIT_BEFORE_TEST_FINISHED");
            secondsToWaitBetweenTestCases = asInt("SECONDS_TO_WAIT_BETWEEN_TEST_CASES");
            manualParticipantsAllocation = asBoolean("MANUAL_PARTICIPANTS_ALLOCATION");
            usersPerWorker = asInt("USERS_PER_WORKER");
            if (usersPerWorker == -1) {
                usersPerWorker = asInt("SESSIONS_PER_WORKER");
            }
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
            workerAvailabilityZone = asOptionalString("WORKER_AVAILABILITY_ZONE");
            workersNumberAtTheBeginning = asInt("WORKERS_NUMBER_AT_THE_BEGINNING");
            recordingWorkersNumberAtTheBeginning = asInt("RECORDING_WORKERS_AT_THE_BEGINNING");
            workerMaxLoad = asInt("WORKER_MAX_LOAD");
            workersRumpUp = asInt("WORKERS_RAMP_UP");
            if (workersRumpUp == -1) {
                workersRumpUp = asInt("WORKERS_RUMP_UP");
            }
            medianodeLoadForStartRecording = asDouble("MEDIANODE_LOAD_FOR_START_RECORDING");
            recordingSessionGroup = asInt("RECORDING_SESSION_GRUPED_BY");
            terminateWorkers = asBoolean("TERMINATE_WORKERS");
            awsSecretAccessKey = asOptionalString("AWS_SECRET_ACCESS_KEY");
            awsAccessKey = asOptionalString("AWS_ACCESS_KEY");
            s3bucketName = asOptionalString("S3_BUCKET_NAME");
            retryMode = asBoolean("RETRY_MODE");
            retryTimes = asInt("RETRY_TIMES");
            qoeAnalysisRecordings = asBoolean("QOE_ANALYSIS_RECORDINGS");
            qoeAnalysisInSitu = asBoolean("QOE_ANALYSIS_IN_SITU");
            paddingDuration = asInt("VIDEO_PADDING_DURATION");
            fragmentDuration = asInt("VIDEO_FRAGMENT_DURATION");
            videoType = asString("VIDEO_TYPE");
            videoHeight = asInt("VIDEO_HEIGHT");
            videoWidth = asInt("VIDEO_WIDTH");
            videoFps = asInt("VIDEO_FPS");
            videoUrl = asOptionalString("VIDEO_URL");
            audioUrl = asOptionalString("AUDIO_URL");
            s3Region = asOptionalString("S3_REGION");
            s3Host = asOptionalString("S3_HOST");
            s3HostAccessKey = asOptionalString("S3_HOST_ACCESS_KEY");
            s3HostSecretKey = asOptionalString("S3_HOST_SECRET_KEY");
            debugVnc = asBoolean("DEBUG_VNC");
            batchMaxRequests = asInt("BATCHES_MAX_REQUESTS");
            if (batchMaxRequests == -1) {
                batchMaxRequests = Runtime.getRuntime().availableProcessors() + 1;
            }
            batches = asBoolean("BATCHES");
            waitCompletion = asBoolean("WAIT_COMPLETE");
            forceContinue = asBoolean("FORCE_CONTINUE");
            this.printInfo();

        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }

    }

    private void printInfo() {
        log.info("-------- Load Test Parameters --------");
        log.info("OpenVidu URL: {}", openviduUrl);
        log.info("Session Name Prefix: {}", sessionNamePrefix);
        log.info("Username Prefix: {}", userNamePrefix);
        log.info("Seconds between users: {}", secondsToWaitBetweenParticipants);
        log.info("Seconds between sessions: {}", secondsToWaitBetweenSession);
        log.info("Is manual participant allocation: {}", manualParticipantsAllocation);
        if (manualParticipantsAllocation) {
            if (usersPerWorker > 0) {
                log.info("Users per worker: {}", usersPerWorker);
            } else {
                log.error("Users per worker is not defined");
                System.exit(1);
            }
        }

        if (retryMode) {
            log.info("Controller started in RETRY MODE");
            if (retryTimes < 1) {
                log.error("Retry times is undefined");
                System.exit(1);
            }
        }

        log.info("");
        log.info("--- WORKER PARAMETERS ---");
        log.info("");

        if (!workerUrlList.isEmpty()) {
            log.info("RUNNING TESTS IN DEVELOPMENT (LOCAL)");
            log.info("");
            log.info("Worker List: {}", workerUrlList);
        } else {
            log.info("RUNNING TESTS IN PRODUCTION (AWS)");
            log.info("");

            log.info("Worker Ami Id: {}", workerAmiId);
            log.info("Worker instance type: {}", workerInstanceType);
            log.info("Worker max load: {}", workerMaxLoad);
            log.info("Workers at the beginning: {}", workersNumberAtTheBeginning);
            log.info("Recording Workers at the beginning: {}", recordingWorkersNumberAtTheBeginning);
            log.info("Worker ramp up: {}", workersRumpUp);
            if (workersRumpUp == 0) {
                log.info("Continue test if there aren't enough workers: {}", forceContinue);
            }
            log.info("AWS instance region: {}", workerInstanceRegion);
            log.info("AWS instance availability zone: {}", workerAvailabilityZone);

        }

        if (medianodeLoadForStartRecording > 0) {
            log.info("Start recording when medianode CPU is over: {}", medianodeLoadForStartRecording);
        }
        if (recordingSessionGroup > 0) {
            log.info("Recording starts each : {} session(s)", recordingSessionGroup);
            if (s3bucketName.isBlank()) {
                log.error("S3 Bucket Name is not defined");
                System.exit(1);
            }
        }

        log.info("");
        log.info("--- MONITORING PARAMETERS ---");
        log.info("");

        log.info("Kibana Host: {}", kibanaHost);
        log.info("ElasticSearch Host: {}", elasticsearchHost);
        log.info("ElasticSearch Username: {}", elasticsearchUserName);
        log.info("ElasticSearch Password: {}", elasticsearchPassword);
        log.info("-------- -------------------- --------");

        log.info("");
        log.info("--- QOE ANALYSIS PARAMETERS ---");
        log.info("");

        log.info("QoE recordings: {}", qoeAnalysisRecordings);
        log.info("QoE analysis will be run in-situ: {}", qoeAnalysisInSitu);
        log.info("Video padding duration: {}", paddingDuration);
        log.info("Video fragment duration: {}", fragmentDuration);
        log.info("-------- -------------------- --------");
        log.info("");
        log.info("--- MISCELANEOUS PARAMETERS ---");
        log.info("");
        log.info("Use batches for inserting users: {}", batches);
        log.info("Maximum number of in flight requests (batch): {}", batchMaxRequests);
        log.info("Wait for user or batch insertion completion: {}", waitCompletion);
        if (isDebugVnc()) {
            log.info("Debug VNC Enabled");
        }
    }

    // -------------------------------------------------------
    // Format Checkers
    // -------------------------------------------------------

    protected String asOptionalURL(String property) throws Exception {
        String url = env.getProperty(property);
        try {
            if ((url != null) && (!url.isEmpty())) {
                checkUrl(url);
                return url;
            }
            return "";
        } catch (Exception e) {
            e.printStackTrace();
            throw new Exception(property + " is wrong." + e);
        }
    }

    protected String asString(String property) throws Exception {
        String value = env.getProperty(property);
        if (value == null || value.isEmpty()) {
            throw new Exception(property + " is required.");
        }
        return value;
    }

    protected List<String> asStringList(String property) throws Exception {
        List<String> value = env.getProperty(property, List.class);
        if (value == null || value.isEmpty()) {
            throw new Exception(property + " is required.");
        }

        return value;
    }

    protected List<String> asOptionalStringList(String property) {
        try {
            return this.asStringList(property);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    protected int asInt(String property) {
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

    protected double asDouble(String property) {
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

    protected String asOptionalString(String property) {
        String value = env.getProperty(property);
        if (value == null || value.isEmpty()) {
            return "";
        }
        return value;
    }

    protected boolean asBoolean(String property) {
        try {
            return Boolean.parseBoolean(env.getProperty(property));
        } catch (Exception e) {
            return false;
        }
    }

    protected void checkUrl(String url) throws Exception {
        try {
            new URI(url);
        } catch (URISyntaxException e) {
            throw new Exception("String '" + url + "' has not a valid URL format: " + e.getMessage());
        }
    }

}
