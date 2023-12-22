package io.openvidu.loadtest.models.testcase.request;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;

public class InitializeRequestBody {

	private String elasticSearchHost = "";
	private String elasticSearchUserName = "";
	private String elasticSearchPassword = "";
	private String elasticSearchIndex = "";
	private String awsAccessKey = "";
	private String awsSecretAccessKey = "";
	private String s3BucketName = "";
	private String minioAccessKey = "";
	private String minioSecretKey = "";
	private String minioBucket = "";
	private int minioPort = 443;
	private String minioHost = "";
	private boolean qoeAnalysisEnabled = false;
	private int paddingDuration = 1;
	private int fragmentDuration = 5;
	private String videoType = "bunny";
	private int videoWidth = 640;
	private int videoHeight = 480;
	private int videoFps = 30;
	private String videoUrl = "";
	private String audioUrl = "";


	public InitializeRequestBody(LoadTestConfig config, String loadtestIndex) {
		this.elasticSearchHost = config.getElasticsearchHost();
		this.elasticSearchUserName = config.getElasticsearchUserName();
		this.elasticSearchPassword = config.getElasticsearchPassword();
		this.elasticSearchIndex = loadtestIndex;
		this.awsAccessKey = config.getAwsAccessKey();
		this.awsSecretAccessKey = config.getAwsSecretAccessKey();
		this.s3BucketName = config.getS3BucketName();
		this.minioAccessKey = config.getMinioAccessKey();
		this.minioSecretKey = config.getMinioSecretKey();
		this.minioBucket = config.getMinioBucket();
		this.minioPort = config.getMinioPort();
		this.minioHost = config.getMinioHost();
		this.qoeAnalysisEnabled = config.isQoeAnalysisRecordings();
		this.paddingDuration = config.getPaddingDuration();
		this.fragmentDuration = config.getFragmentDuration();
		this.videoType = config.getVideoType().toLowerCase();
		this.videoWidth = config.getVideoWidth();
		this.videoHeight = config.getVideoHeight();
		this.videoFps = config.getVideoFps();
		this.videoUrl = config.getVideoUrl();
		this.audioUrl = config.getAudioUrl();
	}

	public JsonObject toJson() {
		JsonObject jsonBody = new JsonObject();
		jsonBody.addProperty("elasticSearchHost", this.elasticSearchHost);
		jsonBody.addProperty("elasticSearchUserName", this.elasticSearchUserName);
		jsonBody.addProperty("elasticSearchPassword", this.elasticSearchPassword);
		jsonBody.addProperty("elasticSearchIndex", this.elasticSearchIndex);
		jsonBody.addProperty("awsAccessKey", this.awsAccessKey);
		jsonBody.addProperty("awsSecretAccessKey", this.awsSecretAccessKey);
		if ((this.s3BucketName != null) && !this.s3BucketName.isEmpty()) {
			jsonBody.addProperty("s3BucketName", this.s3BucketName);
		}
		if ((this.minioAccessKey != null) && !this.minioAccessKey.isEmpty()) {
			jsonBody.addProperty("minioAccessKey", this.minioAccessKey);
			jsonBody.addProperty("minioSecretKey", this.minioSecretKey);
			jsonBody.addProperty("minioHost", this.minioHost);
			jsonBody.addProperty("minioPort", this.minioPort);
			jsonBody.addProperty("minioBucket", this.minioBucket);
		}

		JsonObject browserVideo = new JsonObject();
		if (this.videoType.equals("custom")) {
			browserVideo.addProperty("videoType", "custom");
			JsonObject customVideo = new JsonObject();
			customVideo.addProperty("audioUrl", this.audioUrl);
			JsonObject video = new JsonObject();
			video.addProperty("url", this.videoUrl);
			video.addProperty("width", this.videoWidth);
			video.addProperty("height", this.videoHeight);
			video.addProperty("fps", this.videoFps);
			customVideo.add("video", video);
			browserVideo.add("customVideo", customVideo);
		} else {
			browserVideo.addProperty("videoType", this.videoType);
			JsonObject videoInfo = new JsonObject();
			videoInfo.addProperty("width", this.videoWidth);
			videoInfo.addProperty("height", this.videoHeight);
			videoInfo.addProperty("fps", this.videoFps);
			browserVideo.add("videoInfo", videoInfo);
		}
		jsonBody.add("browserVideo", browserVideo);
		if (this.qoeAnalysisEnabled) {
			JsonObject qoe = new JsonObject();
			qoe.addProperty("enabled", this.qoeAnalysisEnabled);
			qoe.addProperty("paddingDuration", this.paddingDuration);
			qoe.addProperty("fragmentDuration", this.fragmentDuration);
			jsonBody.add("qoeAnalysis", qoe);
		}

		return jsonBody;

	}

}
