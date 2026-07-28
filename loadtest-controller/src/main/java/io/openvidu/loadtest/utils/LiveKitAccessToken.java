package io.openvidu.loadtest.utils;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.google.gson.JsonObject;

/**
 * Builds the HS256 access tokens the OpenVidu/LiveKit server API expects. Kept
 * dependency-free on purpose: the controller only needs a handful of grants to
 * drive the Egress and Room services, which is not worth pulling a JWT library
 * for.
 *
 * @see <a href="https://docs.livekit.io/home/get-started/authentication/">Authentication</a>
 */
public final class LiveKitAccessToken {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();
    private static final long DEFAULT_TTL_SECONDS = 3600;

    private LiveKitAccessToken() {
    }

    /** Token allowed to start and stop recordings of any room. */
    public static String forRecording(String apiKey, String apiSecret) {
        JsonObject grant = new JsonObject();
        grant.addProperty("roomRecord", true);
        return create(apiKey, apiSecret, grant);
    }

    /** Token allowed to inspect a single room, to look up its participants and tracks. */
    public static String forRoomAdmin(String apiKey, String apiSecret, String room) {
        JsonObject grant = new JsonObject();
        grant.addProperty("roomAdmin", true);
        grant.addProperty("room", room);
        return create(apiKey, apiSecret, grant);
    }

    private static String create(String apiKey, String apiSecret, JsonObject videoGrant) {
        long now = Instant.now().getEpochSecond();

        JsonObject header = new JsonObject();
        header.addProperty("alg", "HS256");
        header.addProperty("typ", "JWT");

        JsonObject payload = new JsonObject();
        payload.addProperty("iss", apiKey);
        payload.addProperty("sub", apiKey);
        payload.addProperty("nbf", now);
        payload.addProperty("exp", now + DEFAULT_TTL_SECONDS);
        payload.add("video", videoGrant);

        String signingInput = encode(header.toString()) + "." + encode(payload.toString());
        return signingInput + "." + sign(signingInput, apiSecret);
    }

    private static String encode(String value) {
        return BASE64_URL.encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String sign(String signingInput, String apiSecret) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(apiSecret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            return BASE64_URL.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("Could not sign OpenVidu access token: " + e.getMessage(), e);
        }
    }
}
