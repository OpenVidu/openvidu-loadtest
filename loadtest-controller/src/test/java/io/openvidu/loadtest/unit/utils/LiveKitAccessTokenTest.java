package io.openvidu.loadtest.unit.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.openvidu.loadtest.utils.LiveKitAccessToken;

class LiveKitAccessTokenTest {

    private static final String API_KEY = "devkey";
    private static final String API_SECRET = "secretsecretsecretsecretsecret32";

    @Test
    void recordingTokenHasThreeBase64UrlSegments() {
        String token = LiveKitAccessToken.forRecording(API_KEY, API_SECRET);

        String[] segments = token.split("\\.");
        assertEquals(3, segments.length);
        for (String segment : segments) {
            assertFalse(segment.contains("="), "segments must not be padded");
            assertFalse(segment.contains("+"), "segments must use the URL-safe alphabet");
            assertFalse(segment.contains("/"), "segments must use the URL-safe alphabet");
        }
    }

    @Test
    void recordingTokenDeclaresHs256() {
        JsonObject header = decodeSegment(LiveKitAccessToken.forRecording(API_KEY, API_SECRET), 0);

        assertEquals("HS256", header.get("alg").getAsString());
        assertEquals("JWT", header.get("typ").getAsString());
    }

    @Test
    void recordingTokenGrantsRoomRecordOnEveryRoom() {
        JsonObject payload = decodeSegment(LiveKitAccessToken.forRecording(API_KEY, API_SECRET), 1);

        assertEquals(API_KEY, payload.get("iss").getAsString());
        assertEquals(API_KEY, payload.get("sub").getAsString());
        JsonObject grant = payload.getAsJsonObject("video");
        assertTrue(grant.get("roomRecord").getAsBoolean());
        assertFalse(grant.has("room"), "a recording token is not scoped to one room");
    }

    @Test
    void roomAdminTokenIsScopedToTheGivenRoom() {
        JsonObject payload = decodeSegment(LiveKitAccessToken.forRoomAdmin(API_KEY, API_SECRET, "LoadTestSession1"), 1);

        JsonObject grant = payload.getAsJsonObject("video");
        assertTrue(grant.get("roomAdmin").getAsBoolean());
        assertEquals("LoadTestSession1", grant.get("room").getAsString());
    }

    @Test
    void tokenIsValidFromNowAndExpiresLater() {
        long now = Instant.now().getEpochSecond();
        JsonObject payload = decodeSegment(LiveKitAccessToken.forRecording(API_KEY, API_SECRET), 1);

        long notBefore = payload.get("nbf").getAsLong();
        long expiresAt = payload.get("exp").getAsLong();
        assertTrue(Math.abs(notBefore - now) <= 5, "nbf should be around now, was " + notBefore);
        assertTrue(expiresAt > notBefore, "exp must be after nbf");
    }

    @Test
    void signatureIsHmacSha256OfHeaderAndPayload() throws Exception {
        String token = LiveKitAccessToken.forRecording(API_KEY, API_SECRET);

        int lastDot = token.lastIndexOf('.');
        String signingInput = token.substring(0, lastDot);
        String signature = token.substring(lastDot + 1);

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(API_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String expected = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));

        assertEquals(expected, signature);
    }

    @Test
    void differentSecretsProduceDifferentSignatures() {
        String first = LiveKitAccessToken.forRecording(API_KEY, API_SECRET);
        String second = LiveKitAccessToken.forRecording(API_KEY, "another-secret-entirely-different");

        assertFalse(first.substring(first.lastIndexOf('.')).equals(second.substring(second.lastIndexOf('.'))));
    }

    private JsonObject decodeSegment(String token, int index) {
        String segment = token.split("\\.")[index];
        String json = new String(Base64.getUrlDecoder().decode(segment), StandardCharsets.UTF_8);
        return JsonParser.parseString(json).getAsJsonObject();
    }
}
