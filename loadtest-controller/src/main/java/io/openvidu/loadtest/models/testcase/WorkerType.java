package io.openvidu.loadtest.models.testcase;

public enum WorkerType {
    WORKER("WORKER", "worker"),

	RECORDING_WORKER("RECORDING_WORKER", "recording worker");

	private String label;
	private String value;

	WorkerType(String label, String string) {
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
