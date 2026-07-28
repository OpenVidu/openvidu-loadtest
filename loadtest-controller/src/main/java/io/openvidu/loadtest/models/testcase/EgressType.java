package io.openvidu.loadtest.models.testcase;

/**
 * Kind of recording to start with the OpenVidu/LiveKit Egress service. The
 * choice has a large effect on how much CPU a recording costs, because only
 * some of them transcode: a room composite runs a headless browser plus an
 * encoder, while a track egress writes the incoming track out as it arrives.
 *
 * @see <a href="https://docs.livekit.io/transport/media/ingress-egress/egress/">Egress documentation</a>
 */
public enum EgressType {

    /** One file with every track of a room composited into a layout. */
    ROOM_COMPOSITE("ROOM_COMPOSITE"),

    /** One file per participant, with that participant's audio and video muxed. */
    PARTICIPANT("PARTICIPANT"),

    /** One file per participant combining one audio track and one video track. */
    TRACK_COMPOSITE("TRACK_COMPOSITE"),

    /** One file per track, written without transcoding. */
    TRACK("TRACK"),

    /** No recording. */
    NONE("NONE");

    private final String value;

    EgressType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static EgressType fromValue(String value) {
        if (value == null || value.isBlank()) {
            return NONE;
        }
        String normalized = value.trim().replace('-', '_').toUpperCase();
        for (EgressType type : values()) {
            if (type.value.equals(normalized)) {
                return type;
            }
        }
        return NONE;
    }

    @Override
    public String toString() {
        return value;
    }
}
