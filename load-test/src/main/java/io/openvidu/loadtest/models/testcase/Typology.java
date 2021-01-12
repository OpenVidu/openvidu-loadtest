package io.openvidu.loadtest.models.testcase;

public enum Typology {
	
	NxN("N:N", "N:N"),

	oneNxM("1:M", "1:M"),

	NxM("N:M", "N:M"),

	TEACHING("TEACHING", "TEACHING");

	private String label;
	private String value;

	Typology(String label, String string) {
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
