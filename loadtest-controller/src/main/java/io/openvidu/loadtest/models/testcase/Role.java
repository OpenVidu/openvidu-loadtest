package io.openvidu.loadtest.models.testcase;

public enum Role {

    PUBLISHER("PUBLISHER", "PUBLISHER"),

    SUBSCRIBER("SUBSCRIBER", "SUBSCRIBER");

    private String label;
    private String value;

    Role(String label, String string) {
        this.label = label;
        this.value = string;
    }

    public String getValue() {
        return this.value;
    }

    public String getLabel() {
        return this.label;
    }

    @Override
    public String toString() {
        return this.getLabel();
    }

}
