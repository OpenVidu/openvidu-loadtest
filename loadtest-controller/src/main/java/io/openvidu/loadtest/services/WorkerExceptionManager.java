package io.openvidu.loadtest.services;

import org.springframework.stereotype.Service;

public class WorkerExceptionManager {
	private static WorkerExceptionManager INSTANCE;

	private static String exception = "";

	private WorkerExceptionManager() {

	}

	public synchronized static WorkerExceptionManager getInstance() {
		if (INSTANCE == null) {
			INSTANCE = new WorkerExceptionManager();
		}
		return INSTANCE;
	}

	public synchronized boolean exceptionExist() {
		return !getException().isBlank();
	}

	public synchronized void setException(String exception) {
		WorkerExceptionManager.exception = exception;
	}

	public synchronized String getExceptionAndClean() {
		String result = getException();
		setException("");
		return result;
	}

	private String getException() {
		return exception;
	}

}
