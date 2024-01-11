package io.openvidu.loadtest.services;

import java.util.concurrent.atomic.AtomicBoolean;

public class WorkerExceptionManager {
	private static WorkerExceptionManager INSTANCE;

	private static String exception = "";

	private static AtomicBoolean fatal = new AtomicBoolean(false);

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

	public synchronized boolean isFatal() {
		return fatal.get();
	}

	public synchronized void setException(String exception) {
		if (!isFatal()) {
			WorkerExceptionManager.exception = exception;
		}
	}

	public synchronized void setFatalException(String exception) {
		WorkerExceptionManager.fatal.set(true);
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
