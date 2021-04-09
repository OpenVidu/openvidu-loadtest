package io.openvidu.loadtest.models.testcase;

public enum WorkerUpdatePolicy {
		
	ROUNDROBIN("ROUNDROBIN", "ROUNDROBIN"),

	CAPACITY("CAPACITY", "CAPACITY");


	private String label;
	private String value;

	WorkerUpdatePolicy(String label, String string) {
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
