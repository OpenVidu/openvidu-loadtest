package io.openvidu.loadtest.models.testcase;

public enum Typology {
	
	NxN("N:N", "All participants will be PUBLISHER"),

	NxM("N:M", "N PUBLISHERS and M SUBSCRIBERS"),

	TEACHING("TEACHING", "TEACHING"),
	
	TERMINATE("TERMINATE", "Terminate all Ec2 instances launched");

	private String value;
	private String description;


	Typology(String value, String description) {
		this.value = value;
		this.description = description;

	}

	public String getValue() {
		return this.value;
	}

	public String getDescription() {
		return this.description;
	}

	public String toString() {
		return this.getValue() + ": " + this.description;
	}
}
