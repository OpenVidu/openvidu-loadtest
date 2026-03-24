package io.openvidu.loadtest.config;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;

public abstract class LoadTestConfig {

    private static final Logger log = LoggerFactory.getLogger(LoadTestConfig.class);

    protected final YamlConfigLoader yamlConfig;
    protected final Environment env;

    protected LoadTestConfig(Environment env) {
        this.env = env;
        this.yamlConfig = new YamlConfigLoader(env);
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

    private int batchMaxRequests;

    private boolean batches;

    private boolean waitCompletion;

    private String workerAvailabilityZone;

    private boolean disableHttps;

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

    public int getBatchMaxRequests() {
        return this.batchMaxRequests;
    }

    public String getWorkerAvailabilityZone() {
        return workerAvailabilityZone;
    }

    public boolean isHttpsDisabled() {
        return disableHttps;
    }

    protected void checkConfigurationProperties() {
        try {
            initPlatformAndSessionConfig();
            initDistributionConfig();
            initMonitoringConfig();
            initWorkerConfig();
            initAwsAndRecordingConfig();
            initRetryAndQoeConfig();
            initVideoAndStorageConfig();
            initBatchAndMiscConfig();
            this.printInfo();

        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }

    }

    private void initPlatformAndSessionConfig() {
        openviduUrl = asString("platform.url");
        openviduUrl = openviduUrl.replaceAll("/$", "");
        sessionNamePrefix = defaultIfEmpty(asOptionalString("session.namePrefix"), "LoadTestSession");
        userNamePrefix = defaultIfEmpty(asOptionalString("session.usersNamePrefix"), "User");
        secondsToWaitBetweenParticipants = asInt("session.secondsBetweenParticipants");
        secondsToWaitBetweenSession = defaultIfMinusOne(asInt("session.secondsBetweenSessions"), 0);
        secondsToWaitBeforeTestFinished = defaultIfMinusOne(asInt("session.secondsBeforeTestFinished"), 0);
        secondsToWaitBetweenTestCases = defaultIfMinusOne(asInt("session.secondsBetweenTestCases"), 0);
    }

    private void initDistributionConfig() {
        // FIXME: Force set manual allocation until we figure out a way to obtain media
        // node CPU in OV3, when we realise it set manualAllocation to the value in key
        // "distribution.manual" and set default mode to automatic
        Boolean manualAllocation = true;
        manualParticipantsAllocation = Boolean.TRUE.equals(manualAllocation);
        usersPerWorker = asInt("distribution.usersPerWorker");
        usersPerWorker = usersPerWorker == -1 ? asInt("distribution.sessionsPerWorker") : usersPerWorker;
        if (manualParticipantsAllocation && usersPerWorker <= 0) {
            log.error("distribution.manual is true but distribution.usersPerWorker is not defined");
            System.exit(1);
        }
    }

    private void initMonitoringConfig() throws URISyntaxException {
        // FIXME: See reasons for this is initDistributionConfig() comment
        // elasticsearchHost = asOptionalString("monitoring.elasticsearch.host");
        elasticsearchUserName = asOptionalString("monitoring.elasticsearch.username");
        elasticsearchPassword = asOptionalString("monitoring.elasticsearch.password");
        elasticsearchHost = "";
        kibanaHost = asOptionalURL("monitoring.kibana.host");
    }

    private void initWorkerConfig() {
        workerUrlList = asOptionalStringList("workers.urls");
        workerAmiId = asOptionalString("aws.amiId");
        workerInstanceKeyPair = asOptionalString("aws.keyPairName");
        workerInstanceType = asOptionalString("aws.instanceType");
        workerSecurityGroupId = asOptionalString("aws.securityGroupId");
        workerInstanceRegion = asOptionalString("aws.region");
        workerAvailabilityZone = asOptionalString("aws.availabilityZone");
        workersNumberAtTheBeginning = asInt("aws.workersAtStart");
        recordingWorkersNumberAtTheBeginning = asInt("recording.workersAtStart");
        workerMaxLoad = asInt("distribution.maxLoadPercent");
        workersRumpUp = asInt("aws.rampUpWorkers");
        disableHttps = asBoolean("workers.disableHttps");
    }

    private void initAwsAndRecordingConfig() {
        medianodeLoadForStartRecording = asDouble("recording.mediaNodeLoadThreshold");
        recordingSessionGroup = asInt("recording.sessionsGroupSize");
        terminateWorkers = asBoolean("terminateWorkers");
        awsSecretAccessKey = asOptionalString("aws.secretAccessKey");
        awsAccessKey = asOptionalString("aws.accessKey");
        s3bucketName = asOptionalString("storage.bucket");
    }

    private void initRetryAndQoeConfig() {
        Boolean retryEnabled = yamlConfig.getBooleanOrNull("advanced.retry.enabled");
        retryMode = Boolean.TRUE.equals(retryEnabled);
        retryTimes = defaultIfMinusOne(asInt("advanced.retry.times"), 5);
        qoeAnalysisRecordings = asBoolean("qoe.recordStreams");
        qoeAnalysisInSitu = asBoolean("qoe.analyzeInSitu");
        paddingDuration = asInt("qoe.paddingDuration");
        fragmentDuration = asInt("qoe.fragmentDuration");
    }

    private void initVideoAndStorageConfig() {
        videoType = defaultIfEmpty(asOptionalString("video.type"), "BUNNY");
        videoHeight = defaultIfMinusOne(asInt("video.height"), 480);
        videoWidth = defaultIfMinusOne(asInt("video.width"), 640);
        videoFps = defaultIfMinusOne(asInt("video.fps"), 30);
        videoUrl = asOptionalString("video.customVideoUrl");
        audioUrl = asOptionalString("video.customAudioUrl");
        s3Region = asOptionalString("storage.region");
        s3Host = asOptionalString("storage.endpoint");
        s3HostAccessKey = asOptionalString("storage.accessKey");
        s3HostSecretKey = asOptionalString("storage.secretKey");
    }

    private void initBatchAndMiscConfig() {
        batchMaxRequests = asInt("advanced.batches.maxConcurrentRequests");
        batchMaxRequests = batchMaxRequests == -1 ? Runtime.getRuntime().availableProcessors() + 1 : batchMaxRequests;
        Boolean batchesEnabled = yamlConfig.getBooleanOrNull("advanced.batches.enabled");
        batches = Boolean.TRUE.equals(batchesEnabled);
        Boolean waitCompleteEnabled = yamlConfig.getBooleanOrNull("advanced.waitForCompletion");
        waitCompletion = Boolean.TRUE.equals(waitCompleteEnabled);
    }

    private String defaultIfEmpty(String value, String defaultValue) {
        return value == null || value.isEmpty() ? defaultValue : value;
    }

    private int defaultIfMinusOne(int value, int defaultValue) {
        return value == -1 ? defaultValue : value;
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
        if (this.disableHttps) {
            log.info("HTTPS is disabled for worker URLs.");
        }
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
    }

    // -------------------------------------------------------
    // Format Checkers (now using YamlConfigLoader)
    // -------------------------------------------------------

    protected String asOptionalURL(String property) throws URISyntaxException {
        String url = asOptionalString(property);
        try {
            if ((url != null) && (!url.isEmpty())) {
                checkUrl(url);
                return url;
            }
            return "";
        } catch (URISyntaxException e) {
            e.printStackTrace();
            throw new URISyntaxException(property, "is wrong. " + e.getMessage());
        }
    }

    protected String asString(String property) throws IllegalArgumentException {
        String value = yamlConfig.getString(property);
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException(property + " is required.");
        }
        return value;
    }

    protected List<String> asStringList(String property) throws IllegalArgumentException {
        String value = yamlConfig.getString(property);
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException(property + " is required.");
        }
        return Arrays.asList(value.split(","));
    }

    protected List<String> asOptionalStringList(String property) {
        try {
            return this.asStringList(property);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    protected int asInt(String property) {
        return yamlConfig.getInt(property);
    }

    protected double asDouble(String property) {
        return yamlConfig.getDouble(property);
    }

    protected String asOptionalString(String property) {
        return yamlConfig.getString(property);
    }

    protected boolean asBoolean(String property) {
        return yamlConfig.getBoolean(property);
    }

    protected void checkUrl(String url) throws URISyntaxException {
        try {
            new URI(url);
        } catch (URISyntaxException e) {
            throw new URISyntaxException(url, "has not a valid URL format: " + e.getMessage());
        }
    }

}
