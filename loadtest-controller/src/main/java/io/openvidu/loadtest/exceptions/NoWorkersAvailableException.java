package io.openvidu.loadtest.exceptions;

public class NoWorkersAvailableException extends Exception {
    public NoWorkersAvailableException(String message) {
        super(message);
    }
    
    public NoWorkersAvailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
