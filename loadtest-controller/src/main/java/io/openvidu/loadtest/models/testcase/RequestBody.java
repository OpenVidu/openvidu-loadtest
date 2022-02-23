package io.openvidu.loadtest.models.testcase;

import com.google.gson.JsonObject;

public class RequestBody {

	private String openviduUrl = "";
	private String openviduSecret = "";
	private String elasticSearchHost = "";
	private String elasticSearchUserName = "";
	private String elasticSearchPassword = "";
	private String elasticSearchIndex = "";
	private String awsAccessKey = "";
	private String awsSecretAccessKey = "";
	private BrowserMode browserMode = BrowserMode.EMULATE;
	private String userId = "";
	private String sessionName = "";
	private String token = "";
	private OpenViduRole role = OpenViduRole.PUBLISHER;
	private boolean audio = true;
	private boolean video = true;
	private Resolution resolution = Resolution.MEDIUM;
	private OpenViduRecordingMode openviduRecordingMode;
	private int frameRate = 30;
	private boolean browserRecording = false;
	private boolean showVideoElements = true;
	private boolean headlessBrowser = false;
	private String recordingMetadata = "";
	private String s3BucketName = "";
	private boolean qoeAnalysis = false;

	public boolean isQoeAnalysis() {
		return qoeAnalysis;
	}

	public RequestBody() {
	}

	public String getOpenviduUrl() {
		return openviduUrl;
	}

	public String getOpenviduSecret() {
		return openviduSecret;
	}

	public String getElasticSearchHost() {
		return elasticSearchHost;
	}

	public String getElasticSearchUserName() {
		return elasticSearchUserName;
	}

	public String getElasticSearchPassword() {
		return elasticSearchPassword;
	}

	public String getElasticSearchIndex() {
		return elasticSearchIndex;
	}

	public BrowserMode getBrowserMode() {
		return browserMode;
	}

	public String getUserId() {
		return userId;
	}

	public String getSessionName() {
		return sessionName;
	}

	public String getAwsAccessKey() {
		return awsAccessKey;
	}

	public String getAwsSecretAccessKey() {
		return awsSecretAccessKey;
	}

	public String getToken() {
		return token;
	}

	public OpenViduRole getRole() {
		return role;
	}

	public boolean isAudio() {
		return audio;
	}

	public boolean isVideo() {
		return video;
	}

	public Resolution getResolution() {
		return resolution;
	}

	public OpenViduRecordingMode getOpenviduRecordingMode() {
		return openviduRecordingMode;
	}

	public int getFrameRate() {
		return frameRate;
	}

	public boolean isBrowserRecording() {
		return browserRecording;
	}

	public boolean isShowVideoElements() {
		return showVideoElements;
	}

	public boolean isHeadlessBrowser() {
		return headlessBrowser;
	}

	public RequestBody qoeAnalysis(boolean qoeAnalysis) {
		this.qoeAnalysis = qoeAnalysis;
		return this;
	}

	public RequestBody openviduUrl(String openviduUrl) {
		this.openviduUrl = openviduUrl;
		return this;
	}

	public RequestBody openviduSecret(String openviduSecret) {
		this.openviduSecret = openviduSecret;
		return this;
	}

	public RequestBody elasticSearchHost(String elasticSearchHost) {
		this.elasticSearchHost = elasticSearchHost;
		return this;
	}

	public RequestBody elasticSearchUserName(String elasticSearchUserName) {
		this.elasticSearchUserName = elasticSearchUserName;
		return this;
	}

	public RequestBody elasticSearchPassword(String elasticSearchPassword) {
		this.elasticSearchPassword = elasticSearchPassword;
		return this;
	}

	public RequestBody elasticSearchIndex(String elasticSearchIndex) {
		this.elasticSearchIndex = elasticSearchIndex;
		return this;
	}
	
	public RequestBody awsSecretAccessKey(String awsSecretAccessKey) {
		this.awsSecretAccessKey = awsSecretAccessKey;
		return this;
	}
	
	public RequestBody awsAccessKey(String awsAccessKey) {
		this.awsAccessKey = awsAccessKey;
		return this;
	}

	public RequestBody browserMode(BrowserMode browserMode) {
		this.browserMode = browserMode;
		return this;
	}

	public RequestBody userId(String userId) {
		this.userId = userId;
		return this;
	}

	public RequestBody sessionName(String sessionName) {
		this.sessionName = sessionName;
		return this;
	}

	public RequestBody token(String token) {
		this.token = token;
		return this;
	}

	public RequestBody role(OpenViduRole role) {
		this.role = role;
		return this;
	}

	public RequestBody audio(boolean audio) {
		this.audio = audio;
		return this;
	}

	public RequestBody video(boolean video) {
		this.video = video;
		return this;
	}

	public RequestBody resolution(Resolution resolution) {
		this.resolution = resolution;
		return this;
	}

	public RequestBody openviduRecordingMode(OpenViduRecordingMode openviduRecordingMode) {
		this.openviduRecordingMode = openviduRecordingMode;
		return this;
	}

	public RequestBody frameRate(int frameRate) {
		if (frameRate > 0 && frameRate <= 30) {
			this.frameRate = frameRate;
		}
		return this;
	}

	public RequestBody browserRecording(boolean browserRecording) {
		this.browserRecording = browserRecording;
		return this;
	}

	public RequestBody showVideoElements(boolean showVideoElements) {
		this.showVideoElements = showVideoElements;
		return this;
	}

	public RequestBody headlessBrowser(boolean headlessBrowser) {
		this.headlessBrowser = headlessBrowser;
		return this;
	}
	
	public RequestBody recordingMetadata(String recordingMetadata) {
		this.recordingMetadata = recordingMetadata;
		return this;
	}
	
	public RequestBody s3BucketName(String s3BucketName) {
		this.s3BucketName = s3BucketName;
		return this;
	}

	public RequestBody build() {
		return new RequestBody(openviduUrl, openviduSecret, elasticSearchHost, elasticSearchUserName, elasticSearchPassword, elasticSearchIndex, awsAccessKey, awsSecretAccessKey, browserMode, userId, sessionName, token, role, audio, video,
				resolution, openviduRecordingMode, frameRate, browserRecording, showVideoElements, headlessBrowser, recordingMetadata, s3BucketName, qoeAnalysis);
	}

	public JsonObject toJson() {
		JsonObject jsonBody = new JsonObject();
		JsonObject properties = new JsonObject();
		jsonBody.addProperty("openviduUrl", this.openviduUrl);
		jsonBody.addProperty("openviduSecret", this.openviduSecret);
		jsonBody.addProperty("elasticSearchHost", this.elasticSearchHost);
		jsonBody.addProperty("elasticSearchUserName", this.elasticSearchUserName);
		jsonBody.addProperty("elasticSearchPassword", this.elasticSearchPassword);
		jsonBody.addProperty("elasticSearchIndex", this.elasticSearchIndex);
		jsonBody.addProperty("awsAccessKey", this.awsAccessKey);
		jsonBody.addProperty("awsSecretAccessKey", this.awsSecretAccessKey);
		jsonBody.addProperty("s3BucketName", this.s3BucketName);
		jsonBody.addProperty("browserMode", this.browserMode.getValue());
		jsonBody.addProperty("qoeAnalysis", this.qoeAnalysis);
		properties.addProperty("userId", this.userId);
		properties.addProperty("sessionName", this.sessionName);
		properties.addProperty("role", this.role.getValue());
		properties.addProperty("audio", this.audio);
		properties.addProperty("video", this.video);
		properties.addProperty("resolution", this.resolution.getValue());
		properties.addProperty("frameRate", this.frameRate);
		
		
		if (!token.isEmpty()) {
			properties.addProperty("token", this.token);
		}
		if (this.openviduRecordingMode != null && !this.openviduRecordingMode.getValue().isEmpty()) {
			properties.addProperty("recordingOutputMode", this.openviduRecordingMode.getValue());
		}
		if (this.browserMode.getValue().equals(BrowserMode.REAL.getValue())) {
			properties.addProperty("recording", this.browserRecording);
			properties.addProperty("showVideoElements", this.showVideoElements);
			properties.addProperty("headless", this.headlessBrowser);
		}
		
		if(!this.recordingMetadata.isBlank()) {
			properties.addProperty("recordingMetadata", this.recordingMetadata);
		}
		jsonBody.add("properties", properties);
		return jsonBody;

	}

	private RequestBody(String openviduUrl, String openviduSecret, String elasticSearchHost, String elasticSearchUserName, String elasticSearchPassword, String elasticSearchIndex, String awsAccessKey, String awsSecretAccessKey, BrowserMode browserMode, String userId,
			String sessionName, String token, OpenViduRole role, boolean audio, boolean video, Resolution resolution,
			OpenViduRecordingMode openviduRecordingMode, int frameRate, boolean browserRecording,
			boolean showVideoElements, boolean headlessBrowser, String recordingMetadata, String s3BucketName, boolean qoeAnalysis) {
		super();
		this.openviduUrl = openviduUrl;
		this.openviduSecret = openviduSecret;
		this.elasticSearchHost = elasticSearchHost;
		this.elasticSearchUserName = elasticSearchUserName;
		this.elasticSearchPassword = elasticSearchPassword;
		this.elasticSearchIndex = elasticSearchIndex;
		this.awsAccessKey = awsAccessKey;
		this.awsSecretAccessKey = awsSecretAccessKey;
		this.browserMode = browserMode;
		this.userId = userId;
		this.sessionName = sessionName;
		this.token = token;
		this.role = role;
		this.audio = audio;
		this.video = video;
		this.resolution = resolution;
		this.openviduRecordingMode = openviduRecordingMode;
		this.frameRate = frameRate;
		this.browserRecording = browserRecording;
		this.showVideoElements = showVideoElements;
		this.headlessBrowser = headlessBrowser;
		this.recordingMetadata = recordingMetadata;
		this.s3BucketName = s3BucketName;
		this.qoeAnalysis = qoeAnalysis;
	}

}
