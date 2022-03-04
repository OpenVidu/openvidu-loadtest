package io.openvidu.loadtest.models.testcase;

public enum Resolution {
	
	HIGH("1280x720", "1280x720"),

	MEDIUM("640x480", "640x480"),

	FULLHIGH("1920x1080", "1920x1080");

//	LOW("320x240", "320x240");

	private String label;
	private String value;

	Resolution(String label, String string) {
		this.label = label;
		this.value = string;
	}

	public String getValue() {
		return this.value;
	}

	public String getLabel() {
		return this.label;
	}

	public String toString() {
		return this.getLabel();
	}

}
