package io.openvidu.loadtest.models.testcase;

public enum BrowserMode {
	
	EMULATE("EMULATE", "EMULATE"),

	REAL("REAL", "REAL");


	private String label;
	private String value;

	BrowserMode(String label, String string) {
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
