package io.openvidu.loadtest.models.testcase;

public enum BrowserMode {
	
	EMULATE("EMULATE", "Using KMS or NODE_WEBRTC as a browser"),

	REAL("REAL", "Selenium controlled Chrome Browser");


	private String value;
	private String description;

	BrowserMode(String value, String description) {
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
