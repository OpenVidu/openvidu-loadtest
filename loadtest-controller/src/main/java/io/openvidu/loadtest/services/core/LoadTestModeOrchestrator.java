package io.openvidu.loadtest.services.core;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.Role;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.services.BrowserEmulatorClient;

/**
 * Orchestrates test cases with {@code browser: multi-emulated}: instead of
 * creating one participant at a time, each room is filled by launching one or
 * more {@code lk load-test} chunks (one process per worker), each chunk
 * simulating a slice of the room's publishers/subscribers.
 *
 * <p>
 * Unlike the NORMAL-mode {@link LoadTestParticipantOrchestrator}, this class
 * does not perform CPU-based capacity estimation (that mechanism measures a
 * single emulated-browser process, which doesn't apply when one process
 * serves many simulated users). Per-worker capacity is instead controlled by
 * {@code workers.usersPerWorker} when manual allocation is enabled; otherwise
 * a whole room runs as a single chunk on one worker (unless the room is
 * "infinite", see below).
 *
 * <p>
 * {@code "infinite"} sessions/participants (represented internally as
 * {@link Integer#MAX_VALUE}, see {@link TestCase#getParticipantCount},
 * {@link TestCase#getPublisherCount}, {@link TestCase#getSubscriberCount}) are
 * supported, mirroring NORMAL mode's push-to-failure behavior: chunks keep
 * being launched on successive workers until either a chunk launch fails or
 * {@link LoadTestService#setAndInitializeNextWorker} throws
 * {@link NoWorkersAvailableException} because the worker pool is exhausted.
 * Since a single {@code lk load-test} process cannot itself run "infinitely",
 * an infinite count is grown in fixed-size steps (one step per chunk):
 * {@code distribution.usersPerWorker} when manual allocation is enabled,
 * otherwise a built-in default.
 *
 * <p>
 * Reporting reuses {@link LoadTestParticipantOrchestrator}'s session/participant
 * counters and start-time tracking: each room counts as one session and each
 * chunk's requested publishers/subscribers count as that many synthetic
 * participants, using the same session/user naming convention as NORMAL mode.
 * There is no real per-participant connectionId, CPU, or retry data to report,
 * since a single {@code lk load-test} process simulates many users at once.
 * The same synthetic ids are also sent to the worker so it can index one
 * webrtc-stats document per participant in Elasticsearch, mirroring what
 * NORMAL mode's per-participant flow indexes.
 */
class LoadTestModeOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(LoadTestModeOrchestrator.class);

    /**
     * Chunk size used to grow an "infinite" room when
     * {@code distribution.usersPerWorker} isn't configured.
     */
    private static final int DEFAULT_INFINITE_CHUNK_SIZE = 50;

    private final LoadTestService loadTestService;
    private final BrowserEmulatorClient browserEmulatorClient;
    private final LoadTestConfig loadTestConfig;
    private final LoadTestParticipantOrchestrator participantOrchestrator;

    LoadTestModeOrchestrator(LoadTestService loadTestService, BrowserEmulatorClient browserEmulatorClient,
            LoadTestConfig loadTestConfig, LoadTestParticipantOrchestrator participantOrchestrator) {
        this.loadTestService = loadTestService;
        this.browserEmulatorClient = browserEmulatorClient;
        this.loadTestConfig = loadTestConfig;
        this.participantOrchestrator = participantOrchestrator;
    }

    CreateParticipantResponse runNxN(TestCase testCase, int participantsBySession) throws NoWorkersAvailableException {
        return runSessions(testCase, participantsBySession, 0);
    }

    CreateParticipantResponse runNxM(TestCase testCase, int publishers, int subscribers)
            throws NoWorkersAvailableException {
        return runSessions(testCase, publishers, subscribers);
    }

    CreateParticipantResponse runOneSessionNxN(TestCase testCase, int participantCount)
            throws NoWorkersAvailableException {
        String room = loadTestConfig.getSessionNamePrefix() + "1";
        log.info("[LOADTEST mode] Starting one session '{}' with {} video publishers", room,
                describeCount(participantCount));
        int sessionNum = participantOrchestrator.startLoadTestSession();
        return runRoomChunks(new String[] { "" }, testCase, room, sessionNum, participantCount, 0);
    }

    CreateParticipantResponse runOneSessionNxM(TestCase testCase, int publishers, int subscribers)
            throws NoWorkersAvailableException {
        String room = loadTestConfig.getSessionNamePrefix() + "1";
        log.info("[LOADTEST mode] Starting one session '{}' with {} video publishers and {} subscribers", room,
                describeCount(publishers), describeCount(subscribers));
        int sessionNum = participantOrchestrator.startLoadTestSession();
        return runRoomChunks(new String[] { "" }, testCase, room, sessionNum, publishers, subscribers);
    }

    private CreateParticipantResponse runSessions(TestCase testCase, int publishers, int subscribers)
            throws NoWorkersAvailableException {
        int sessionsLimit = testCase.getSessions();
        boolean infiniteSessions = sessionsLimit == -1;
        if (infiniteSessions) {
            log.info("[LOADTEST mode] 'infinite' sessions requested; rooms will keep being created until no more "
                    + "workers are available.");
        }

        // The worker cursor is shared across sessions so consecutive rooms keep
        // advancing round-robin through the worker pool instead of restarting at
        // the first worker for every session.
        String[] workerCursor = { "" };
        CreateParticipantResponse lastResponse = new CreateParticipantResponse().setResponseOk(true);
        int sessionsStarted = 0;
        while (infiniteSessions || sessionsStarted < sessionsLimit) {
            CreateParticipantResponse forcedStop = checkForcedStop();
            if (forcedStop != null) {
                return forcedStop;
            }
            sessionsStarted++;
            int sessionNum = participantOrchestrator.startLoadTestSession();
            String room = loadTestConfig.getSessionNamePrefix() + sessionNum;
            log.info("[LOADTEST mode] Starting session '{}' with {} video publishers and {} subscribers", room,
                    describeCount(publishers), describeCount(subscribers));
            lastResponse = runRoomChunks(workerCursor, testCase, room, sessionNum, publishers, subscribers);
            if (!lastResponse.isResponseOk()) {
                return lastResponse;
            }
            participantOrchestrator.completeLoadTestSession();
        }
        return lastResponse;
    }

    private CreateParticipantResponse runRoomChunks(String[] workerCursor, TestCase testCase, String room,
            int sessionNum, int videoPublishers, int subscribers) throws NoWorkersAvailableException {
        int stepSize = resolveStepSize(room, videoPublishers, subscribers);

        int remainingPublishers = videoPublishers;
        int remainingSubscribers = subscribers;
        while (remainingPublishers > 0 || remainingSubscribers > 0) {
            CreateParticipantResponse forcedStop = checkForcedStop();
            if (forcedStop != null) {
                return forcedStop;
            }
            int chunkPublishers = capChunk(remainingPublishers, stepSize);
            int chunkSubscribers = capChunk(remainingSubscribers, stepSize - chunkPublishers);

            List<String> publisherIds = participantOrchestrator.nextUserIds(chunkPublishers);
            List<String> subscriberIds = participantOrchestrator.nextUserIds(chunkSubscribers);
            List<String> chunkParticipantIds = new ArrayList<>(publisherIds);
            chunkParticipantIds.addAll(subscriberIds);

            workerCursor[0] = loadTestService.setAndInitializeNextWorker(workerCursor[0], WorkerType.WORKER);
            boolean launched = browserEmulatorClient.launchLoadTest(workerCursor[0], testCase, room, chunkPublishers,
                    0, chunkSubscribers, chunkParticipantIds);
            if (!launched) {
                String reason = "Failed to launch load-test chunk on worker " + workerCursor[0] + " for room "
                        + room;
                log.error(reason);
                return new CreateParticipantResponse().setResponseOk(false).setStopReason(reason);
            }

            participantOrchestrator.recordLoadTestParticipants(sessionNum, Role.PUBLISHER, publisherIds);
            participantOrchestrator.recordLoadTestParticipants(sessionNum, Role.SUBSCRIBER, subscriberIds);

            remainingPublishers = decrement(remainingPublishers, chunkPublishers);
            remainingSubscribers = decrement(remainingSubscribers, chunkSubscribers);
        }
        return new CreateParticipantResponse().setResponseOk(true);
    }

    /**
     * Resolves the per-chunk step size for a room. When
     * {@code distribution.manual} is enabled, {@code distribution.usersPerWorker}
     * is used. Otherwise, a finite room runs as a single chunk (no cap), while an
     * "infinite" room falls back to {@link #DEFAULT_INFINITE_CHUNK_SIZE} since a
     * single {@code lk load-test} process cannot simulate an unbounded number of
     * users.
     */
    private int resolveStepSize(String room, int videoPublishers, int subscribers) {
        int capacityPerWorker = loadTestConfig.isManualParticipantsAllocation() ? loadTestConfig.getUsersPerWorker()
                : 0;
        if (capacityPerWorker > 0) {
            return capacityPerWorker;
        }
        boolean infinite = videoPublishers == Integer.MAX_VALUE || subscribers == Integer.MAX_VALUE;
        if (infinite) {
            log.warn("[LOADTEST mode] Room '{}' requests 'infinite' participants without "
                    + "distribution.usersPerWorker set; defaulting to chunks of {} users per lk load-test process. "
                    + "Set distribution.manual=true and distribution.usersPerWorker to control this.", room,
                    DEFAULT_INFINITE_CHUNK_SIZE);
            return DEFAULT_INFINITE_CHUNK_SIZE;
        }
        return Integer.MAX_VALUE; // whole (finite) room fits in a single chunk
    }

    /**
     * Checks whether a global stop condition was raised asynchronously (e.g.
     * {@code advanced.maxParticipantErrors} reached via a worker's WebSocket
     * health-error report), independent of this chunk/session's own launch result.
     */
    private CreateParticipantResponse checkForcedStop() {
        CreateParticipantResponse forcedStop = browserEmulatorClient.getLastErrorReconnectingResponse();
        if (forcedStop != null) {
            log.error("[LOADTEST mode] Stopping: {}", forcedStop.getStopReason());
        }
        return forcedStop;
    }

    /** Caps a (possibly infinite) remaining count to at most {@code limit} for one chunk. */
    private static int capChunk(int remaining, int limit) {
        if (remaining <= 0) {
            return 0;
        }
        if (remaining == Integer.MAX_VALUE) {
            return limit;
        }
        return Math.min(remaining, limit);
    }

    /** Decrements a (possibly infinite) remaining count by the amount just consumed. */
    private static int decrement(int remaining, int amount) {
        return remaining == Integer.MAX_VALUE ? Integer.MAX_VALUE : remaining - amount;
    }

    private static String describeCount(int count) {
        return count == Integer.MAX_VALUE ? "infinite" : String.valueOf(count);
    }
}
