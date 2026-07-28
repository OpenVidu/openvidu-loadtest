package io.openvidu.loadtest.models.testcase;

/**
 * Recording settings of a test case: what kind of Egress job to run, on how
 * many of the test's rooms, and how the output should be encoded.
 *
 * <p>
 * Recordings start once the test case has all its participants connected, run
 * for the whole {@code session.secondsBeforeTestFinished} hold, and are stopped
 * before the results report is written, so a report always covers a known
 * number of recordings running for a known window.
 */
public class EgressConfig {

    public static final String DEFAULT_LAYOUT = "grid";
    public static final String DEFAULT_FILE_PREFIX = "loadtest";
    private static final int DEFAULT_JOBS_PER_ROOM = 1;

    private final EgressType type;
    private final int rooms;
    private final int jobsPerRoom;
    private final int startAfterSeconds;
    private final String preset;
    private final String layout;
    private final boolean audioOnly;
    private final String fileType;
    private final String filePrefix;

    public static EgressConfig disabled() {
        return new EgressConfig(EgressType.NONE, 0, DEFAULT_JOBS_PER_ROOM, 0, "", DEFAULT_LAYOUT, false, "",
                DEFAULT_FILE_PREFIX);
    }

    public EgressConfig(EgressType type, int rooms, int jobsPerRoom, int startAfterSeconds, String preset,
            String layout, boolean audioOnly, String fileType, String filePrefix) {
        this.type = type != null ? type : EgressType.NONE;
        this.rooms = Math.max(0, rooms);
        this.jobsPerRoom = jobsPerRoom > 0 ? jobsPerRoom : DEFAULT_JOBS_PER_ROOM;
        this.startAfterSeconds = Math.max(0, startAfterSeconds);
        this.preset = preset != null ? preset : "";
        this.layout = layout != null && !layout.isBlank() ? layout : DEFAULT_LAYOUT;
        this.audioOnly = audioOnly;
        this.fileType = fileType != null ? fileType : "";
        this.filePrefix = filePrefix != null && !filePrefix.isBlank() ? filePrefix : DEFAULT_FILE_PREFIX;
    }

    public boolean isEnabled() {
        return type != EgressType.NONE;
    }

    public EgressType getType() {
        return type;
    }

    /** Number of the test's rooms to record. {@code 0} means every room. */
    public int getRooms() {
        return rooms;
    }

    /**
     * Jobs to start per recorded room. Always 1 for {@link EgressType#ROOM_COMPOSITE},
     * which produces a single output for the whole room.
     */
    public int getJobsPerRoom() {
        return type == EgressType.ROOM_COMPOSITE ? 1 : jobsPerRoom;
    }

    /** Seconds to wait after the room is full before starting to record. */
    public int getStartAfterSeconds() {
        return startAfterSeconds;
    }

    /** Egress encoding preset, e.g. {@code H264_720P_30}. Empty means the Egress default. */
    public String getPreset() {
        return preset;
    }

    /** Room composite layout, e.g. {@code grid} or {@code speaker}. */
    public String getLayout() {
        return layout;
    }

    public boolean isAudioOnly() {
        return audioOnly;
    }

    /** Output container: {@code MP4} or {@code OGG}. Empty means the Egress default. */
    public String getFileType() {
        return fileType;
    }

    public String getFilePrefix() {
        return filePrefix;
    }

    @Override
    public String toString() {
        if (!isEnabled()) {
            return "NONE";
        }
        return type + " (" + (rooms == 0 ? "all" : rooms) + " room(s)"
                + (type == EgressType.ROOM_COMPOSITE ? ", layout " + layout : ", " + getJobsPerRoom() + " job(s)/room")
                + (preset.isBlank() ? "" : ", preset " + preset)
                + (audioOnly ? ", audio only" : "")
                + (startAfterSeconds > 0 ? ", starting after " + startAfterSeconds + "s" : "") + ")";
    }
}
