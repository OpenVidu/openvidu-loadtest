package io.openvidu.loadtest.services;

import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;

import io.openvidu.loadtest.models.testcase.WorkerType;

@Service
public class CurrentWorkerService {
    private AtomicReference<String> currentWorkerUrl = new AtomicReference<>("");
    private AtomicReference<String> currentRecordingWorkerUrl = new AtomicReference<>("");

    public String getCurrentWorkerUrl(WorkerType workerType) {
        return workerType.equals(WorkerType.WORKER) ? currentWorkerUrl.get() : currentRecordingWorkerUrl.get();
    }

    public void setCurrentWorkerUrl(String currentWorkerUrl, WorkerType workerType) {
        if (workerType.equals(WorkerType.WORKER)) {
            this.currentWorkerUrl.set(currentWorkerUrl);
        } else {
            this.currentRecordingWorkerUrl.set(currentWorkerUrl);
        }
    }
}
