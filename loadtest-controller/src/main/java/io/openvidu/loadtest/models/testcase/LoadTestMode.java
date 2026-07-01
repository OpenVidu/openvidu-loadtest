package io.openvidu.loadtest.models.testcase;

/**
 * Execution mode of a test case.
 *
 * <ul>
 * <li>{@link #NORMAL}: default behavior. Each participant is created one at a
 * time via {@code POST /openvidu-browser/streamManager} (emulated or real
 * browsers).</li>
 * <li>{@link #LOADTEST}: uses LiveKit's {@code lk load-test} command. A single
 * process per worker/room chunk simulates many publishers/subscribers.</li>
 * </ul>
 */
public enum LoadTestMode {
    NORMAL("NORMAL"),
    LOADTEST("LOADTEST");

    private final String value;

    LoadTestMode(String value) {
        this.value = value;
    }

    public String getValue() {
        return this.value;
    }

    @Override
    public String toString() {
        return this.getValue();
    }
}
