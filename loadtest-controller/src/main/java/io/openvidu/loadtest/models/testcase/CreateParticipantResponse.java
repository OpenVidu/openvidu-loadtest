package io.openvidu.loadtest.models.testcase;

public class CreateParticipantResponse {
    private boolean responseOk;
    private String stopReason;
    private String connectionId;
    private double workerCpuPct;
    private int streamsInWorker;
    private int participantsInWorker;
    private String userId;
    private String sessionId;

    public CreateParticipantResponse() {}

    public CreateParticipantResponse(boolean responseOk, String stopReason, String connectionId,
        int streamsInWorker, int participantsInWorker, String userId, String sessionId, double workerCpuPct) {
        this.responseOk = responseOk;
        this.stopReason = stopReason;
        this.connectionId = connectionId;
        this.streamsInWorker = streamsInWorker;
        this.participantsInWorker = participantsInWorker;
        this.userId = userId;
        this.sessionId = sessionId;
        this.workerCpuPct = workerCpuPct;
    }

    public boolean isResponseOk() {
        return responseOk;
    }

    public CreateParticipantResponse setResponseOk(boolean responseOk) {
        this.responseOk = responseOk;
        return this;
    }

    public String getStopReason() {
        return stopReason;
    }

    public CreateParticipantResponse setStopReason(String stopReason) {
        this.stopReason = stopReason;
        return this;
    }

    public String getConnectionId() {
        return connectionId;
    }

    public CreateParticipantResponse setConnectionId(String connectionId) {
        this.connectionId = connectionId;
        return this;
    }

    public double getWorkerCpuPct() {
        return workerCpuPct;
    }

    public CreateParticipantResponse setWorkerCpuPct(double workerCpuPct) {
        this.workerCpuPct = workerCpuPct;
        return this;
    }

    public int getStreamsInWorker() {
        return streamsInWorker;
    }

    public CreateParticipantResponse setStreamsInWorker(int streamsInWorker) {
        this.streamsInWorker = streamsInWorker;
        return this;
    }

    public int getParticipantsInWorker() {
        return participantsInWorker;
    }

    public CreateParticipantResponse setParticipantsInWorker(int participantsInWorker) {
        this.participantsInWorker = participantsInWorker;
        return this;
    }

    public String getUserId() {
        return userId;
    }

    public CreateParticipantResponse setUserId(String userId) {
        this.userId = userId;
        return this;
    }

    public String getSessionId() {
        return sessionId;
    }

    public CreateParticipantResponse setSessionId(String sessionId) {
        this.sessionId = sessionId;
        return this;
    }

    @Override
    public String toString() {
        return "CreateParticipantResponse [responseOk=" + responseOk + ", stopReason=" + stopReason + ", connectionId="
                + connectionId + ", workerCpuPct=" + workerCpuPct + ", streamsInWorker=" + streamsInWorker
                + ", participantsInWorker=" + participantsInWorker + ", userId=" + userId + ", sessionId=" + sessionId
                + "]";
    }
    
    
}
