package io.openvidu.loadtest.models.testcase;

public enum Topology {

    N_X_N("N:N", "All participants will be PUBLISHER"),

    N_X_M("N:M", "N PUBLISHERS and M SUBSCRIBERS"),

    TEACHING("TEACHING", "TEACHING"),

    ONE_SESSION_NXN("ONE_SESSION_NXN", "One session filled with N publishers"),

    ONE_SESSION_NXM("ONE_SESSION_NXM", "One session with N publishers filled with M subscribers");

    private String value;
    private String description;

    Topology(String value, String description) {
        this.value = value;
        this.description = description;

    }

    public String getValue() {
        return this.value;
    }

    public String getDescription() {
        return this.description;
    }

    @Override
    public String toString() {
        return this.getValue() + ": " + this.description;
    }
}
