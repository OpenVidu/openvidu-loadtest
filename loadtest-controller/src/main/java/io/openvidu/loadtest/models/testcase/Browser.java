package io.openvidu.loadtest.models.testcase;

public enum Browser {
    CHROME("chrome"),
    FIREFOX("firefox"),
    CUSTOM_EMULATED("custom-emulated"),
    EMULATED("emulated");

    private final String userBrowser;

    Browser(String browser) {
        this.userBrowser = browser;
    }

    public String getValue() {
        return this.userBrowser;
    }

    @Override
    public String toString() {
        return this.getValue();
    }
}
