package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.EgressConfig;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;
import io.openvidu.loadtest.utils.LiveKitAccessToken;

/**
 * Starts and stops recordings through the OpenVidu/LiveKit Egress service.
 *
 * <p>
 * Talks to the server's Twirp API directly rather than through a worker: a
 * recording is a platform operation, and it must be possible to stop one even
 * after the workers that generated the load are gone.
 *
 * @see <a href="https://docs.livekit.io/reference/server/server-apis/">Server APIs</a>
 */
@Service
public class LiveKitEgressClient {

    private static final Logger log = LoggerFactory.getLogger(LiveKitEgressClient.class);

    private static final String EGRESS_SERVICE = "/twirp/livekit.Egress/";
    private static final String ROOM_SERVICE = "/twirp/livekit.RoomService/";
    private static final int HTTP_STATUS_OK = 200;
    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String ROOM_NAME_FIELD = "room_name";
    private static final String FILE_OUTPUTS_FIELD = "file_outputs";

    /**
     * A participant of a room together with the ids of its first audio and video
     * tracks, which is what track and track-composite recordings need.
     */
    public record ParticipantTracks(String identity, String audioTrackId, String videoTrackId) {

        public boolean hasAudioAndVideo() {
            return !audioTrackId.isBlank() && !videoTrackId.isBlank();
        }
    }

    private final LoadTestConfig loadTestConfig;
    private final CustomHttpClient httpClient;
    private final JsonUtils jsonUtils;

    public LiveKitEgressClient(LoadTestConfig loadTestConfig, CustomHttpClient httpClient, JsonUtils jsonUtils) {
        this.loadTestConfig = loadTestConfig;
        this.httpClient = httpClient;
        this.jsonUtils = jsonUtils;
    }

    /**
     * Whether recordings can be driven at all: the Egress API is LiveKit-only, so
     * an OpenVidu 2 platform configuration cannot use it.
     */
    public boolean isAvailable() {
        return loadTestConfig instanceof LKLoadTestConfig;
    }

    /** Records every track of a room into a single composited file. */
    public String startRoomComposite(String room, EgressConfig config) throws IOException, InterruptedException {
        JsonObject body = new JsonObject();
        body.addProperty(ROOM_NAME_FIELD, room);
        body.addProperty("layout", config.getLayout());
        if (config.isAudioOnly()) {
            body.addProperty("audio_only", true);
        }
        body.add(FILE_OUTPUTS_FIELD, fileOutputs(config, room, "composite"));
        addPreset(body, config);
        return startEgress("StartRoomCompositeEgress", body);
    }

    /** Records one participant's audio and video into a single file. */
    public String startParticipant(String room, String identity, EgressConfig config)
            throws IOException, InterruptedException {
        JsonObject body = new JsonObject();
        body.addProperty(ROOM_NAME_FIELD, room);
        body.addProperty("identity", identity);
        body.add(FILE_OUTPUTS_FIELD, fileOutputs(config, room, identity));
        addPreset(body, config);
        return startEgress("StartParticipantEgress", body);
    }

    /** Records one audio track and one video track into a single file. */
    public String startTrackComposite(String room, ParticipantTracks tracks, EgressConfig config)
            throws IOException, InterruptedException {
        JsonObject body = new JsonObject();
        body.addProperty(ROOM_NAME_FIELD, room);
        body.addProperty("audio_track_id", tracks.audioTrackId());
        if (!config.isAudioOnly()) {
            body.addProperty("video_track_id", tracks.videoTrackId());
        }
        body.add(FILE_OUTPUTS_FIELD, fileOutputs(config, room, tracks.identity()));
        addPreset(body, config);
        return startEgress("StartTrackCompositeEgress", body);
    }

    /** Writes a single track out without transcoding it. */
    public String startTrack(String room, String trackId, EgressConfig config)
            throws IOException, InterruptedException {
        JsonObject body = new JsonObject();
        body.addProperty(ROOM_NAME_FIELD, room);
        body.addProperty("track_id", trackId);
        // TrackEgress takes a single direct file output and no encoding options,
        // since the track is written as it arrives
        JsonObject file = new JsonObject();
        file.addProperty("filepath", filepath(config, room, trackId));
        addStorage(file);
        body.add("file", file);
        return startEgress("StartTrackEgress", body);
    }

    public void stopEgress(String egressId) throws IOException, InterruptedException {
        JsonObject body = new JsonObject();
        body.addProperty("egress_id", egressId);
        JsonObject response = post(EGRESS_SERVICE + "StopEgress", body, recordingToken());
        log.debug("Stopped egress {}: {}", egressId, response);
    }

    /**
     * Participants of a room with their first audio and video track ids. Returns
     * an empty list when the room has no participants or cannot be inspected.
     */
    public List<ParticipantTracks> listParticipants(String room) throws IOException, InterruptedException {
        JsonObject body = new JsonObject();
        body.addProperty("room", room);
        JsonObject response = post(ROOM_SERVICE + "ListParticipants", body, roomAdminToken(room));

        List<ParticipantTracks> participants = new ArrayList<>();
        JsonElement participantsElement = response.get("participants");
        if (participantsElement == null || !participantsElement.isJsonArray()) {
            return participants;
        }
        for (JsonElement participantElement : participantsElement.getAsJsonArray()) {
            JsonObject participant = participantElement.getAsJsonObject();
            String identity = asString(participant, "identity");
            String audioTrackId = "";
            String videoTrackId = "";
            JsonElement tracksElement = participant.get("tracks");
            if (tracksElement != null && tracksElement.isJsonArray()) {
                for (JsonElement trackElement : tracksElement.getAsJsonArray()) {
                    JsonObject track = trackElement.getAsJsonObject();
                    String type = asString(track, "type");
                    String sid = asString(track, "sid");
                    if ("AUDIO".equalsIgnoreCase(type) && audioTrackId.isBlank()) {
                        audioTrackId = sid;
                    } else if ("VIDEO".equalsIgnoreCase(type) && videoTrackId.isBlank()) {
                        videoTrackId = sid;
                    }
                }
            }
            participants.add(new ParticipantTracks(identity, audioTrackId, videoTrackId));
        }
        return participants;
    }

    private String startEgress(String method, JsonObject body) throws IOException, InterruptedException {
        JsonObject response = post(EGRESS_SERVICE + method, body, recordingToken());
        String egressId = asString(response, "egress_id");
        if (egressId.isBlank()) {
            // Twirp JSON responses use lowerCamelCase when the server serializes
            // with the protobuf JSON names
            egressId = asString(response, "egressId");
        }
        if (egressId.isBlank()) {
            throw new IOException("Egress started but no egress id was returned: " + response);
        }
        return egressId;
    }

    private JsonObject post(String path, JsonObject body, String token) throws IOException, InterruptedException {
        String url = baseUrl() + path;
        Map<String, String> headers = new HashMap<>();
        headers.put(AUTHORIZATION_HEADER, BEARER_PREFIX + token);

        HttpResponse<String> response = httpClient.sendPost(url, body, null, headers);
        if (response.statusCode() != HTTP_STATUS_OK) {
            throw new IOException(
                    "OpenVidu API " + path + " returned status " + response.statusCode() + ": " + response.body());
        }
        JsonObject json = jsonUtils.getJson(response.body());
        return json != null ? json : new JsonObject();
    }

    /**
     * Output file for a recording. Only a filepath is sent unless the load test
     * has its own {@code storage} configured, in which case the recording is
     * uploaded there; with no storage block, the Egress service writes to whatever
     * storage the OpenVidu deployment itself is configured with.
     */
    private JsonArray fileOutputs(EgressConfig config, String room, String target) {
        JsonObject output = new JsonObject();
        if (!config.getFileType().isBlank()) {
            output.addProperty("file_type", config.getFileType().toUpperCase());
        }
        output.addProperty("filepath", filepath(config, room, target));
        addStorage(output);

        JsonArray outputs = new JsonArray();
        outputs.add(output);
        return outputs;
    }

    private void addStorage(JsonObject output) {
        String bucket = loadTestConfig.getS3BucketName();
        if (bucket == null || bucket.isBlank()) {
            return;
        }
        JsonObject s3 = new JsonObject();
        s3.addProperty("bucket", bucket);
        addIfPresent(s3, "region", loadTestConfig.getS3Region());
        addIfPresent(s3, "endpoint", loadTestConfig.getS3Host());
        addIfPresent(s3, "access_key", loadTestConfig.getS3HostAccessKey());
        addIfPresent(s3, "secret", loadTestConfig.getS3HostSecretKey());
        if (loadTestConfig.getS3Host() != null && !loadTestConfig.getS3Host().isBlank()) {
            // S3-compatible services such as MinIO need path-style addressing
            s3.addProperty("force_path_style", true);
        }
        output.add("s3", s3);
    }

    private void addIfPresent(JsonObject json, String property, String value) {
        if (value != null && !value.isBlank()) {
            json.addProperty(property, value);
        }
    }

    private void addPreset(JsonObject body, EgressConfig config) {
        if (!config.getPreset().isBlank()) {
            body.addProperty("preset", config.getPreset().toUpperCase());
        }
    }

    private String filepath(EgressConfig config, String room, String target) {
        String extension = "OGG".equalsIgnoreCase(config.getFileType()) ? "ogg" : "mp4";
        String sanitizedTarget = target.replaceAll("[^a-zA-Z0-9_.-]", "_");
        return config.getFilePrefix() + "/" + room + "-" + sanitizedTarget + "-{time}." + extension;
    }

    private String baseUrl() {
        return loadTestConfig.getOpenViduUrl()
                .replaceFirst("^ws://", "http://")
                .replaceFirst("^wss://", "https://")
                .replaceAll("/$", "");
    }

    private String recordingToken() {
        LKLoadTestConfig config = requireLiveKitConfig();
        return LiveKitAccessToken.forRecording(config.getApiKey(), config.getApiSecret());
    }

    private String roomAdminToken(String room) {
        LKLoadTestConfig config = requireLiveKitConfig();
        return LiveKitAccessToken.forRoomAdmin(config.getApiKey(), config.getApiSecret(), room);
    }

    private LKLoadTestConfig requireLiveKitConfig() {
        if (loadTestConfig instanceof LKLoadTestConfig lkConfig) {
            return lkConfig;
        }
        throw new IllegalStateException("Recording requires a LiveKit platform configuration (the Egress API is "
                + "LiveKit-only)");
    }

    private String asString(JsonObject json, String property) {
        JsonElement element = json.get(property);
        return element != null && !element.isJsonNull() ? element.getAsString() : "";
    }
}
