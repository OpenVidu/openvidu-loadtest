package io.openvidu.loadtest.services.core;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;

public class LoadTestParticipantRunState {
    private String worker;
    private String recordingWorker = "";
    private int browsersInWorker = 0;
    private int tasksInProgress = 0;
    private int participantCounter = 0;

    private final int startingParticipants;
    private final int batchMax;
    private final int maxRequestsInFlight;
    private final boolean batches;
    private final boolean waitCompletion;

    private final AtomicReference<CreateParticipantResponse> lastResponse = new AtomicReference<>(null);
    private final AtomicBoolean stop = new AtomicBoolean(false);
    private List<CompletableFuture<CreateParticipantResponse>> futureList;

    public LoadTestParticipantRunState(String worker, int startingParticipants, int batchMax, boolean batches,
            boolean waitCompletion, int maxRequestsInFlight) {
        this.worker = worker;
        this.startingParticipants = startingParticipants;
        this.batchMax = batchMax;
        this.batches = batches;
        this.waitCompletion = waitCompletion;
        this.maxRequestsInFlight = maxRequestsInFlight;
        this.futureList = new ArrayList<>(maxRequestsInFlight);
    }

    public boolean isStartingParticipant() {
        return this.startingParticipants > 0 && this.participantCounter <= this.startingParticipants;
    }

    public boolean isLastStartingParticipant() {
        return this.startingParticipants > 0 && this.participantCounter == this.startingParticipants;
    }

    public String getWorker() {
        return worker;
    }

    public String getRecordingWorker() {
        return recordingWorker;
    }

    public int getBrowsersInWorker() {
        return browsersInWorker;
    }

    public int getTasksInProgress() {
        return tasksInProgress;
    }

    public int getParticipantCounter() {
        return participantCounter;
    }

    public int getStartingParticipants() {
        return startingParticipants;
    }

    public int getBatchMax() {
        return batchMax;
    }

    public int getMaxRequestsInFlight() {
        return maxRequestsInFlight;
    }

    public boolean isBatches() {
        return batches;
    }

    public boolean isWaitCompletion() {
        return waitCompletion;
    }

    public CreateParticipantResponse getLastResponse() {
        return lastResponse.get();
    }

    public void setLastResponse(CreateParticipantResponse response) {
        this.lastResponse.set(response);
    }

    public boolean getStop() {
        return stop.get();
    }

    public void setStop(boolean stop) {
        this.stop.set(stop);
    }

    public List<CompletableFuture<CreateParticipantResponse>> getFutureList() {
        return futureList;
    }

    public void setWorker(String worker) {
        this.worker = worker;
    }

    public void setRecordingWorker(String recordingWorker) {
        this.recordingWorker = recordingWorker;
    }

    public void setBrowsersInWorker(int browsersInWorker) {
        this.browsersInWorker = browsersInWorker;
    }

    public void setTasksInProgress(int tasksInProgress) {
        this.tasksInProgress = tasksInProgress;
    }

    public void setParticipantCounter(int participantCounter) {
        this.participantCounter = participantCounter;
    }

    public void addToFutureList(CompletableFuture<CreateParticipantResponse> future) {
        this.futureList.add(future);
    }

    public void resetFutureList() {
        this.futureList = new ArrayList<>(maxRequestsInFlight);
    }

}