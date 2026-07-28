package io.openvidu.loadtest.unit.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.EgressConfig;
import io.openvidu.loadtest.models.testcase.EgressType;
import io.openvidu.loadtest.services.LiveKitEgressClient;
import io.openvidu.loadtest.services.LiveKitEgressClient.ParticipantTracks;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

class LiveKitEgressClientTest {

    @Mock
    private LKLoadTestConfig loadTestConfig;
    @Mock
    private CustomHttpClient httpClient;

    private LiveKitEgressClient egressClient;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(loadTestConfig.getOpenViduUrl()).thenReturn("wss://openvidu.example.io:7443");
        when(loadTestConfig.getApiKey()).thenReturn("devkey");
        when(loadTestConfig.getApiSecret()).thenReturn("secret");
        egressClient = new LiveKitEgressClient(loadTestConfig, httpClient, new JsonUtils());
    }

    private void mockResponse(int status, String body) throws Exception {
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body);
        when(httpClient.sendPost(any(), any(), isNull(), anyMap())).thenReturn(response);
    }

    private JsonObject captureBody() throws Exception {
        ArgumentCaptor<JsonObject> bodyCaptor = ArgumentCaptor.forClass(JsonObject.class);
        org.mockito.Mockito.verify(httpClient).sendPost(any(), bodyCaptor.capture(), isNull(), anyMap());
        return bodyCaptor.getValue();
    }

    private String captureUrl() throws Exception {
        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(httpClient).sendPost(urlCaptor.capture(), any(), isNull(), anyMap());
        return urlCaptor.getValue();
    }

    private Map<String, String> captureHeaders() throws Exception {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> headersCaptor = ArgumentCaptor.forClass(Map.class);
        org.mockito.Mockito.verify(httpClient).sendPost(any(), any(), isNull(), headersCaptor.capture());
        return headersCaptor.getValue();
    }

    @Test
    void isAvailableOnlyForLiveKitPlatforms() {
        assertTrue(egressClient.isAvailable());

        LoadTestConfig openViduTwoConfig = mock(LoadTestConfig.class);
        LiveKitEgressClient client = new LiveKitEgressClient(openViduTwoConfig, httpClient, new JsonUtils());
        assertFalse(client.isAvailable());
    }

    @Test
    void roomCompositePostsToTwirpEgressEndpointOverHttps() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");

        String egressId = egressClient.startRoomComposite("LoadTestSession1", EgressConfig.disabled());

        assertEquals("EG_123", egressId);
        // The websocket URL must be turned into an HTTP one for the server API
        assertEquals("https://openvidu.example.io:7443/twirp/livekit.Egress/StartRoomCompositeEgress", captureUrl());
        assertTrue(captureHeaders().get("Authorization").startsWith("Bearer "));
    }

    @Test
    void roomCompositeSendsLayoutAndFileOutput() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");
        EgressConfig config = new EgressConfig(EgressType.ROOM_COMPOSITE, 0, 1, 0, "H264_1080P_30", "speaker", false,
                "MP4", "run7");

        egressClient.startRoomComposite("LoadTestSession1", config);

        JsonObject body = captureBody();
        assertEquals("LoadTestSession1", body.get("room_name").getAsString());
        assertEquals("speaker", body.get("layout").getAsString());
        assertEquals("H264_1080P_30", body.get("preset").getAsString());
        assertFalse(body.has("audio_only"));
        JsonObject fileOutput = body.getAsJsonArray("file_outputs").get(0).getAsJsonObject();
        assertEquals("MP4", fileOutput.get("file_type").getAsString());
        assertTrue(fileOutput.get("filepath").getAsString().startsWith("run7/LoadTestSession1-composite-"));
        assertTrue(fileOutput.get("filepath").getAsString().endsWith(".mp4"));
    }

    @Test
    void roomCompositeSendsAudioOnlyWhenRequested() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");
        EgressConfig config = new EgressConfig(EgressType.ROOM_COMPOSITE, 0, 1, 0, "", "grid", true, "OGG", "run");

        egressClient.startRoomComposite("room", config);

        JsonObject body = captureBody();
        assertTrue(body.get("audio_only").getAsBoolean());
        JsonObject fileOutput = body.getAsJsonArray("file_outputs").get(0).getAsJsonObject();
        assertTrue(fileOutput.get("filepath").getAsString().endsWith(".ogg"));
    }

    @Test
    void participantEgressSendsIdentity() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_P\"}");

        egressClient.startParticipant("room", "User3", EgressConfig.disabled());

        JsonObject body = captureBody();
        assertEquals("room", body.get("room_name").getAsString());
        assertEquals("User3", body.get("identity").getAsString());
        assertTrue(body.has("file_outputs"));
        assertEquals("https://openvidu.example.io:7443/twirp/livekit.Egress/StartParticipantEgress", captureUrl());
    }

    @Test
    void trackCompositeSendsBothTrackIds() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_TC\"}");
        ParticipantTracks tracks = new ParticipantTracks("User1", "TR_AUDIO", "TR_VIDEO");

        egressClient.startTrackComposite("room", tracks, EgressConfig.disabled());

        JsonObject body = captureBody();
        assertEquals("TR_AUDIO", body.get("audio_track_id").getAsString());
        assertEquals("TR_VIDEO", body.get("video_track_id").getAsString());
    }

    @Test
    void trackCompositeOmitsVideoWhenAudioOnly() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_TC\"}");
        EgressConfig config = new EgressConfig(EgressType.TRACK_COMPOSITE, 0, 1, 0, "", "grid", true, "", "run");
        ParticipantTracks tracks = new ParticipantTracks("User1", "TR_AUDIO", "TR_VIDEO");

        egressClient.startTrackComposite("room", tracks, config);

        JsonObject body = captureBody();
        assertEquals("TR_AUDIO", body.get("audio_track_id").getAsString());
        assertFalse(body.has("video_track_id"));
    }

    @Test
    void trackEgressSendsSingleDirectFileAndNoPreset() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_T\"}");
        EgressConfig config = new EgressConfig(EgressType.TRACK, 0, 1, 0, "H264_720P_30", "grid", false, "MP4", "run");

        egressClient.startTrack("room", "TR_VIDEO", config);

        JsonObject body = captureBody();
        assertEquals("TR_VIDEO", body.get("track_id").getAsString());
        assertTrue(body.has("file"), "TrackEgress takes a single direct file output");
        assertFalse(body.has("file_outputs"));
        assertFalse(body.has("preset"), "a track is written without transcoding, so it has no encoding options");
    }

    @Test
    void fileOutputUploadsToConfiguredStorage() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");
        when(loadTestConfig.getS3BucketName()).thenReturn("my-bucket");
        when(loadTestConfig.getS3Region()).thenReturn("eu-west-1");
        when(loadTestConfig.getS3Host()).thenReturn("https://minio.example.io");
        when(loadTestConfig.getS3HostAccessKey()).thenReturn("access");
        when(loadTestConfig.getS3HostSecretKey()).thenReturn("secret");

        egressClient.startRoomComposite("room", EgressConfig.disabled());

        JsonObject s3 = captureBody().getAsJsonArray("file_outputs").get(0).getAsJsonObject().getAsJsonObject("s3");
        assertEquals("my-bucket", s3.get("bucket").getAsString());
        assertEquals("eu-west-1", s3.get("region").getAsString());
        assertEquals("https://minio.example.io", s3.get("endpoint").getAsString());
        assertEquals("access", s3.get("access_key").getAsString());
        assertEquals("secret", s3.get("secret").getAsString());
        assertTrue(s3.get("force_path_style").getAsBoolean(), "S3-compatible endpoints need path-style addressing");
    }

    @Test
    void fileOutputHasNoStorageBlockWhenNoneIsConfigured() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");
        when(loadTestConfig.getS3BucketName()).thenReturn("");

        egressClient.startRoomComposite("room", EgressConfig.disabled());

        // With no storage block the Egress service uses the deployment's own storage
        assertFalse(captureBody().getAsJsonArray("file_outputs").get(0).getAsJsonObject().has("s3"));
    }

    @Test
    void acceptsCamelCaseEgressIdFromServer() throws Exception {
        mockResponse(200, "{\"egressId\":\"EG_CAMEL\",\"status\":\"EGRESS_STARTING\"}");

        assertEquals("EG_CAMEL", egressClient.startRoomComposite("room", EgressConfig.disabled()));
    }

    @Test
    void failsWhenServerReturnsAnError() throws Exception {
        mockResponse(401, "invalid token");

        IOException error = assertThrows(IOException.class,
                () -> egressClient.startRoomComposite("room", EgressConfig.disabled()));
        assertTrue(error.getMessage().contains("401"));
    }

    @Test
    void failsWhenServerReturnsNoEgressId() throws Exception {
        mockResponse(200, "{\"status\":\"EGRESS_STARTING\"}");

        assertThrows(IOException.class, () -> egressClient.startRoomComposite("room", EgressConfig.disabled()));
    }

    @Test
    void stopEgressSendsEgressId() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\",\"status\":\"EGRESS_ENDING\"}");

        egressClient.stopEgress("EG_123");

        assertEquals("EG_123", captureBody().get("egress_id").getAsString());
        assertEquals("https://openvidu.example.io:7443/twirp/livekit.Egress/StopEgress", captureUrl());
    }

    @Test
    void listParticipantsReadsFirstAudioAndVideoTrackOfEach() throws Exception {
        mockResponse(200, """
                {"participants":[
                  {"identity":"User1","tracks":[
                    {"sid":"TR_A1","type":"AUDIO"},
                    {"sid":"TR_V1","type":"VIDEO"},
                    {"sid":"TR_V2","type":"VIDEO"}]},
                  {"identity":"User2","tracks":[{"sid":"TR_A2","type":"AUDIO"}]}
                ]}""");

        List<ParticipantTracks> participants = egressClient.listParticipants("room");

        assertEquals(2, participants.size());
        assertEquals(new ParticipantTracks("User1", "TR_A1", "TR_V1"), participants.get(0));
        assertTrue(participants.get(0).hasAudioAndVideo());
        assertEquals(new ParticipantTracks("User2", "TR_A2", ""), participants.get(1));
        assertFalse(participants.get(1).hasAudioAndVideo());
    }

    @Test
    void listParticipantsIsEmptyForAnEmptyRoom() throws Exception {
        mockResponse(200, "{}");

        assertTrue(egressClient.listParticipants("room").isEmpty());
    }

    @Test
    void roomAdminTokenIsUsedToListParticipants() throws Exception {
        mockResponse(200, "{\"participants\":[]}");

        egressClient.listParticipants("LoadTestSession1");

        assertEquals("https://openvidu.example.io:7443/twirp/livekit.RoomService/ListParticipants", captureUrl());
    }

    @Test
    void nonLiveKitPlatformCannotStartRecordings() {
        LoadTestConfig openViduTwoConfig = mock(LoadTestConfig.class);
        when(openViduTwoConfig.getOpenViduUrl()).thenReturn("https://openvidu.example.io");
        LiveKitEgressClient client = new LiveKitEgressClient(openViduTwoConfig, httpClient, new JsonUtils());

        assertThrows(IllegalStateException.class,
                () -> client.startRoomComposite("room", EgressConfig.disabled()));
    }

    @Test
    void filepathIsSafeForTrackAndParticipantIdentifiers() throws Exception {
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");

        egressClient.startParticipant("room", "User/with spaces", EgressConfig.disabled());

        String filepath = captureBody().getAsJsonArray("file_outputs").get(0).getAsJsonObject()
                .get("filepath").getAsString();
        assertTrue(filepath.contains("User_with_spaces"), "unexpected filepath: " + filepath);
    }

    @Test
    void httpsUrlIsLeftUnchanged() throws Exception {
        when(loadTestConfig.getOpenViduUrl()).thenReturn("https://openvidu.example.io/");
        egressClient = new LiveKitEgressClient(loadTestConfig, httpClient, new JsonUtils());
        mockResponse(200, "{\"egress_id\":\"EG_123\"}");

        egressClient.startRoomComposite("room", EgressConfig.disabled());

        assertEquals("https://openvidu.example.io/twirp/livekit.Egress/StartRoomCompositeEgress", captureUrl());
    }
}
