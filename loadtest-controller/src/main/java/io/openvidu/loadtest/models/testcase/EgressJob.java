package io.openvidu.loadtest.models.testcase;

import java.util.Calendar;

/**
 * One Egress job started during a test case, and when it ran. The window is
 * what makes a recording's cost measurable: node CPU during it, compared with
 * the same load before it started, is the cost of that recording.
 */
public class EgressJob {

    private final String egressId;
    private final EgressType type;
    private final String room;
    private final String target;
    private final Calendar startedAt;
    private Calendar stoppedAt;
    private String error;

    public EgressJob(String egressId, EgressType type, String room, String target, Calendar startedAt) {
        this.egressId = egressId;
        this.type = type;
        this.room = room;
        this.target = target != null ? target : "";
        this.startedAt = startedAt;
    }

    public static EgressJob failed(EgressType type, String room, String target, String error) {
        EgressJob job = new EgressJob("", type, room, target, Calendar.getInstance());
        job.setError(error);
        return job;
    }

    public String getEgressId() {
        return egressId;
    }

    public EgressType getType() {
        return type;
    }

    public String getRoom() {
        return room;
    }

    /** Participant identity or track id this job recorded, empty for a room composite. */
    public String getTarget() {
        return target;
    }

    public Calendar getStartedAt() {
        return startedAt;
    }

    public Calendar getStoppedAt() {
        return stoppedAt;
    }

    public void setStoppedAt(Calendar stoppedAt) {
        this.stoppedAt = stoppedAt;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public boolean isStarted() {
        return egressId != null && !egressId.isBlank();
    }

    /** Seconds the job was running, or 0 if it never started or was never stopped. */
    public long getDurationSeconds() {
        if (startedAt == null || stoppedAt == null) {
            return 0;
        }
        return (stoppedAt.getTimeInMillis() - startedAt.getTimeInMillis()) / 1000;
    }
}
