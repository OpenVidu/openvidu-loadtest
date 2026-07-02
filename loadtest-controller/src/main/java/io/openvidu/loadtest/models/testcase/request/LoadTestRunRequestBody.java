package io.openvidu.loadtest.models.testcase.request;

import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;

/**
 * Body of a request to launch an {@code lk load-test} chunk on a worker. Unlike
 * {@link CreateUserRequestBody}, a single chunk simulates many
 * publishers/subscribers in one room.
 */
public class LoadTestRunRequestBody {

    private final String openviduUrl;
    private final String livekitApiKey;
    private final String livekitApiSecret;
    private final String room;
    private final int videoPublishers;
    private final int audioPublishers;
    private final int subscribers;
    private final String videoResolution;
    private final String videoCodec;
    private final boolean simulcast;
    private final String layout;
    private final List<String> participantIds;

    public LoadTestRunRequestBody(LKLoadTestConfig config, TestCase testCase, String room, int videoPublishers,
            int audioPublishers, int subscribers, List<String> participantIds) {
        this.openviduUrl = config.getOpenViduUrl();
        this.livekitApiKey = config.getApiKey();
        this.livekitApiSecret = config.getApiSecret();
        this.room = room;
        this.videoPublishers = videoPublishers;
        this.audioPublishers = audioPublishers;
        this.subscribers = subscribers;
        this.videoResolution = mapResolution(testCase.getResolution());
        this.videoCodec = testCase.getVideoCodec();
        this.simulcast = testCase.isSimulcast();
        this.layout = testCase.getLayout();
        this.participantIds = participantIds;
    }

    private static String mapResolution(Resolution resolution) {
        if (resolution == Resolution.FULLHIGH) {
            return "high";
        } else if (resolution == Resolution.HIGH) {
            return "medium";
        }
        return "low";
    }

    public JsonObject toJson() {
        JsonObject jsonBody = new JsonObject();
        jsonBody.addProperty("openviduUrl", this.openviduUrl);
        jsonBody.addProperty("livekitApiKey", this.livekitApiKey);
        jsonBody.addProperty("livekitApiSecret", this.livekitApiSecret);
        jsonBody.addProperty("room", this.room);
        if (this.videoPublishers > 0) {
            jsonBody.addProperty("videoPublishers", this.videoPublishers);
        }
        if (this.audioPublishers > 0) {
            jsonBody.addProperty("audioPublishers", this.audioPublishers);
        }
        if (this.subscribers > 0) {
            jsonBody.addProperty("subscribers", this.subscribers);
        }
        if (this.videoResolution != null && !this.videoResolution.isBlank()) {
            jsonBody.addProperty("videoResolution", this.videoResolution);
        }
        if (this.videoCodec != null && !this.videoCodec.isBlank()) {
            jsonBody.addProperty("videoCodec", this.videoCodec);
        }
        jsonBody.addProperty("simulcast", this.simulcast);
        if (this.layout != null && !this.layout.isBlank()) {
            jsonBody.addProperty("layout", this.layout);
        }
        if (this.participantIds != null && !this.participantIds.isEmpty()) {
            JsonArray participantIdsArray = new JsonArray();
            this.participantIds.forEach(participantIdsArray::add);
            jsonBody.add("participantIds", participantIdsArray);
        }
        return jsonBody;
    }
}
