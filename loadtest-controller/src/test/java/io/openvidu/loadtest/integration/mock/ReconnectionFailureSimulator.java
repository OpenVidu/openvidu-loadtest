package io.openvidu.loadtest.integration.mock;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Simulates participant reconnection failures for integration testing.
 * Supports registering specific participants to fail on creation or on
 * reconnection.
 */
public class ReconnectionFailureSimulator {
    private static final Logger log = LoggerFactory.getLogger(ReconnectionFailureSimulator.class);

    private static final int MAX_RETRIES = 5;

    // Participants that should fail on initial creation
    private final Set<String> failOnCreateParticipants = ConcurrentHashMap.newKeySet();
    // Participants that should fail on reconnection (after WebSocket disconnect)
    private final Set<String> failOnReconnectParticipants = ConcurrentHashMap.newKeySet();
    // Participants that should fail a specific number of times on creation
    private final Map<String, Integer> failOnCreateNTimes = new ConcurrentHashMap<>();
    // Track failure counts per participant
    private final Map<String, AtomicInteger> retryCounts = new ConcurrentHashMap<>();

    public ReconnectionFailureSimulator(String failUserId, String failUserSession) {
        addFailOnCreate(failUserId, failUserSession);
    }

    public ReconnectionFailureSimulator() {
    }

    /**
     * Register a participant to fail on initial HTTP creation.
     * The participant will fail MAX_RETRIES times then succeed.
     */
    public void addFailOnCreate(String userId, String sessionName) {
        String completeUser = userId + "-" + sessionName;
        failOnCreateParticipants.add(completeUser);
        log.info("Registered {} to fail on creation", completeUser);
    }

    /**
     * Register a participant to fail N times on initial HTTP creation, then
     * succeed.
     */
    public void addFailOnCreateNTimes(String userId, String sessionName, int n) {
        String completeUser = userId + "-" + sessionName;
        failOnCreateNTimes.put(completeUser, n);
        log.info("Registered {} to fail {} times on creation", completeUser, n);
    }

    /**
     * Register a participant to fail on reconnection (after WebSocket disconnect).
     * The participant will fail MAX_RETRIES times then succeed.
     */
    public void addFailOnReconnect(String userId, String sessionName) {
        String completeUser = userId + "-" + sessionName;
        failOnReconnectParticipants.add(completeUser);
        log.info("Registered {} to fail on reconnection", completeUser);
    }

    /**
     * Check if this participant should fail on creation.
     * Returns true if the participant is registered to fail and hasn't exceeded its
     * failure limit.
     */
    public boolean shouldFailOnCreate(String userId, String sessionName) {
        String completeUser = userId + "-" + sessionName;

        // Check if registered for N-time failures
        Integer maxFailures = failOnCreateNTimes.get(completeUser);
        if (maxFailures != null) {
            AtomicInteger count = retryCounts.computeIfAbsent(completeUser, k -> new AtomicInteger(0));
            int currentFailures = count.get();
            if (currentFailures < maxFailures) {
                log.info("Creation failure for {} (attempt {}/{})", completeUser, currentFailures + 1, maxFailures);
                return true;
            }
            log.info("Creation for {} succeeded after {} failed attempts", completeUser, maxFailures);
            return false;
        }

        // Check if registered for full MAX_RETRIES failures
        if (failOnCreateParticipants.contains(completeUser)) {
            return true;
        }

        return false;
    }

    /**
     * Check if this participant should fail on reconnection.
     * Returns true for the first MAX_RETRIES attempts, then false.
     */
    public boolean shouldFailOnReconnect(String userId, String sessionName) {
        String completeUser = userId + "-" + sessionName;
        if (!failOnReconnectParticipants.contains(completeUser)) {
            return false;
        }
        AtomicInteger count = retryCounts.computeIfAbsent(completeUser, k -> new AtomicInteger(0));
        int attemptsSoFar = count.get();
        if (attemptsSoFar < MAX_RETRIES) {
            log.info("Reconnection failure for {} (attempt {}/{})", completeUser, attemptsSoFar + 1, MAX_RETRIES);
            return true;
        }
        log.info("Reconnection for {} succeeded after {} failed attempts", completeUser, MAX_RETRIES);
        return false;
    }

    /**
     * Record a failure attempt for a participant on creation.
     * Returns the retry attempt number (1-based), or -1 if max retries exceeded.
     */
    public int recordFailure(String completeUser) {
        AtomicInteger count = retryCounts.computeIfAbsent(completeUser, k -> new AtomicInteger(0));
        int attempts = count.incrementAndGet();
        log.info("Creation failure recorded for {}. Attempt {}/{}", completeUser, attempts, MAX_RETRIES);
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
        failOnCreateParticipants.clear();
        failOnReconnectParticipants.clear();
        retryCounts.clear();
    }
}
