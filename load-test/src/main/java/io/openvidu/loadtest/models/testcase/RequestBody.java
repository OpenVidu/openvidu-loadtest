package io.openvidu.loadtest.models.testcase;

import com.google.gson.JsonObject;

public class RequestBody {

	private String openviduUrl;
	private String openviduSecret;
	private String elasticSearchHost;
	private String elasticSearchUserName;
	private String elasticSearchPassword;
	private BrowserMode browserMode = BrowserMode.EMULATE;
	private String userId;
	private String sessionName;
	private String token = "";
	private OpenViduRole role = OpenViduRole.PUBLISHER;
	private boolean audio = true;
	private boolean video = true;
	private Resolution resolution = Resolution.MEDIUM;
	private OutputMode recordingOutputMode;
	private int frameRate = 30;
	private boolean recording = false;
	private boolean showVideoElements = true;
	private boolean headless = false;

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

	public BrowserMode getBrowserMode() {
		return browserMode;
	}

	public String getUserId() {
		return userId;
	}

	public String getSessionName() {
		return sessionName;
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

	public OutputMode getRecordingOutputMode() {
		return recordingOutputMode;
	}

	public int getFrameRate() {
		return frameRate;
	}

	public boolean isRecording() {
		return recording;
	}

	public boolean isShowVideoElements() {
		return showVideoElements;
	}

	public boolean isHeadless() {
		return headless;
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

	public RequestBody recordingOutputMode(OutputMode recordingOutputMode) {
		this.recordingOutputMode = recordingOutputMode;
		return this;
	}

	public RequestBody frameRate(int frameRate) {
		if (frameRate > 0 && frameRate <= 30) {
			this.frameRate = frameRate;
		}
		return this;
	}

	public RequestBody recording(boolean recording) {
		this.recording = recording;
		return this;
	}

	public RequestBody showVideoElements(boolean showVideoElements) {
		this.showVideoElements = showVideoElements;
		return this;
	}

	public RequestBody headless(boolean headless) {
		this.headless = headless;
		return this;
	}

	public RequestBody build() {
		return new RequestBody(openviduUrl, openviduSecret, elasticSearchHost, elasticSearchUserName,
				elasticSearchPassword, browserMode, userId, sessionName, token, role, audio, video, resolution,
				recordingOutputMode, frameRate, recording, showVideoElements, headless);
	}

	public JsonObject toJson() {
		JsonObject jsonBody = new JsonObject();
		JsonObject properties = new JsonObject();
		jsonBody.addProperty("openviduUrl", this.openviduUrl);
		jsonBody.addProperty("openviduSecret", this.openviduSecret);
		jsonBody.addProperty("elasticSearchHost", this.elasticSearchHost);
		jsonBody.addProperty("elasticSearchUserName", this.elasticSearchUserName);
		jsonBody.addProperty("elasticSearchPassword", this.elasticSearchPassword);
		jsonBody.addProperty("browserMode", this.browserMode.getValue());
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
		if (this.recordingOutputMode != null && !this.recordingOutputMode.getValue().isEmpty()) {
			properties.addProperty("recordingOutputMode", this.recordingOutputMode.getValue());
		}
		if (this.browserMode.getValue().equals(BrowserMode.REAL.getValue())) {
			properties.addProperty("recording", this.recording);
			properties.addProperty("showVideoElements", this.showVideoElements);
			properties.addProperty("headless", this.headless);
		}
		jsonBody.add("properties", properties);
		return jsonBody;

	}

	private RequestBody(String openviduUrl, String openviduSecret, String elasticSearchHost,
			String elasticSearchUserName, String elasticSearchPassword, BrowserMode browserMode, String userId,
			String sessionName, String token, OpenViduRole role, boolean audio, boolean video, Resolution resolution,
			OutputMode recordingOutputMode, int frameRate, boolean recording, boolean showVideoElements,
			boolean headless) {
		super();
		this.openviduUrl = openviduUrl;
		this.openviduSecret = openviduSecret;
		this.elasticSearchHost = elasticSearchHost;
		this.elasticSearchUserName = elasticSearchUserName;
		this.elasticSearchPassword = elasticSearchPassword;
		this.browserMode = browserMode;
		this.userId = userId;
		this.sessionName = sessionName;
		this.token = token;
		this.role = role;
		this.audio = audio;
		this.video = video;
		this.resolution = resolution;
		this.recordingOutputMode = recordingOutputMode;
		this.frameRate = frameRate;
		this.recording = recording;
		this.showVideoElements = showVideoElements;
		this.headless = headless;
	}

}
