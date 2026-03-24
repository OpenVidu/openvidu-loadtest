package io.openvidu.loadtest.exceptions;

public class LoadTestInitializationException extends RuntimeException {

    public LoadTestInitializationException(String message) {
        super(message);
    }

    public LoadTestInitializationException(String message, Throwable cause) {
        super(message, cause);
    }
}
