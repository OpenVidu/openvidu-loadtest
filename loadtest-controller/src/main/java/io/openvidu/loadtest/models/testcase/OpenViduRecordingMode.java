package io.openvidu.loadtest.models.testcase;

public enum OpenViduRecordingMode {
	
	NONE ("", "No recording set"),
	
	COMPOSED("COMPOSED", "Every publisher stream is composed in the same video file in a grid layout."),

	INDIVIDUAL("INDIVIDUAL", "Every publisher stream is recorded in its own file");


	private String value;
	private String description;

	OpenViduRecordingMode(String value, String description) {
		this.value = value;
		this.description = description;
	}

	public String getValue() {
		return this.value;
	}

	public String getDesription() {
		return this.description;
	}

	public String toString() {
		return this.getValue() + ": " + this.getDesription();
	}

}
