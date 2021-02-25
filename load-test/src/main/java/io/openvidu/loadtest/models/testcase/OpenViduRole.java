package io.openvidu.loadtest.models.testcase;

public enum OpenViduRole {
	
	PUBLISHER("PUBLISHER", "PUBLISHER"),

	SUBSCRIBER("SUBSCRIBER", "SUBSCRIBER");


	private String label;
	private String value;

	OpenViduRole(String label, String string) {
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
