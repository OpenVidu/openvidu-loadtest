package io.openvidu.loadtest.integration.mock;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Simulates participant reconnection failures for integration testing.
 * Participant with userId "User200" will fail after 5 retry attempts,
 * triggering test termination.
 */
public class ReconnectionFailureSimulator {
    private static final Logger log = LoggerFactory.getLogger(ReconnectionFailureSimulator.class);

    private String failUserId;
    private String failUserSession;
    private static final int MAX_RETRIES = 5;

    private final Set<String> failedParticipants = ConcurrentHashMap.newKeySet();
    private final Map<String, AtomicInteger> retryCounts = new ConcurrentHashMap<>();

    public ReconnectionFailureSimulator(String failUserId, String failUserSession) {
        this.failUserId = failUserId;
        this.failUserSession = failUserSession;
    }

    /**
     * Check if this participant should fail on creation.
     * Only fails when userId is exactly "User200".
     */
    public boolean shouldFailOnCreate(String userId, String sessionName) {
        String completeUser = userId + "-" + sessionName;
        // If this participant already failed before, it's a retry - still fail
        if (failedParticipants.contains(completeUser)) {
            return true;
        }

        // Check if this is the participant we want to fail
        if (userId != null && userId.startsWith(failUserId) && sessionName != null
                && sessionName.equals(failUserSession)) {
            log.info("Participant {} in session {} will be forced to fail", userId, sessionName);
            failedParticipants.add(completeUser);
            return true;
        }
        return false;
    }

    /**
     * Record a failure attempt for a participant.
     * Returns the retry attempt number (1-based), or -1 if max retries exceeded.
     */
    public int recordFailure(String userId) {
        AtomicInteger count = retryCounts.computeIfAbsent(userId, k -> new AtomicInteger(0));
        int attempts = count.incrementAndGet();
        log.info("Failure recorded for {}. Attempt {}/{}", userId, attempts, MAX_RETRIES);
        return attempts <= MAX_RETRIES ? attempts : -1;
    }

    /**
     * Check if this participant has exhausted all retries.
     */
    public boolean isMaxRetriesExhausted(String userId) {
        AtomicInteger count = retryCounts.get(userId);
        return count != null && count.get() > MAX_RETRIES;
    }

    /**
     * Get max retries allowed.
     */
    public int getMaxRetries() {
        return MAX_RETRIES;
    }

    /**
     * Reset the simulator for a new test run.
     */
    public void reset() {
        failedParticipants.clear();
        retryCounts.clear();
    }
}
