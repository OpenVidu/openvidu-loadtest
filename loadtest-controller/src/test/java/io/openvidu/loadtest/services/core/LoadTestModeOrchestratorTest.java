package io.openvidu.loadtest.services.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Topology;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Sleeper;

class LoadTestModeOrchestratorTest {

    @Mock
    private LoadTestService loadTestService;
    @Mock
    private BrowserEmulatorClient browserEmulatorClient;
    @Mock
    private LoadTestConfig loadTestConfig;
    @Mock
    private ElasticSearchClient esClient;
    @Mock
    private Sleeper sleeper;

    private LoadTestParticipantOrchestrator participantOrchestrator;
    private LoadTestModeOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        participantOrchestrator = new LoadTestParticipantOrchestrator(loadTestService, browserEmulatorClient,
                esClient, loadTestConfig, sleeper);
        orchestrator = new LoadTestModeOrchestrator(loadTestService, browserEmulatorClient, loadTestConfig,
                participantOrchestrator);

        when(loadTestConfig.getSessionNamePrefix()).thenReturn("session");
        when(loadTestConfig.getUserNamePrefix()).thenReturn("User");
        when(loadTestConfig.isManualParticipantsAllocation()).thenReturn(false);

        // Enough workers for the finite-chunking tests; infinite tests configure a
        // smaller pool themselves so they terminate via NoWorkersAvailableException.
        mockWorkerPool("worker1", "worker2", "worker3", "worker4", "worker5", "worker6");

        when(browserEmulatorClient.launchLoadTest(anyString(), any(TestCase.class), anyString(), anyInt(), anyInt(),
                anyInt(), anyList())).thenReturn(true);
    }

    /** Configures the round-robin worker mock to hand out exactly {@code pool}, then throw. */
    private void mockWorkerPool(String... pool) {
        List<String> workers = Arrays.asList(pool);
        try {
            when(loadTestService.setAndInitializeNextWorker(anyString(), eq(WorkerType.WORKER)))
                    .thenAnswer(invocation -> {
                        String current = invocation.getArgument(0);
                        int nextIndex = workers.indexOf(current) + 1;
                        if (nextIndex >= workers.size()) {
                            throw new NoWorkersAvailableException("No more workers available");
                        }
                        return workers.get(nextIndex);
                    });
        } catch (NoWorkersAvailableException e) {
            throw new IllegalStateException(e);
        }
    }

    private TestCase testCase(Topology topology, List<String> participants, int sessions) {
        return new TestCase(topology.getValue(), participants, sessions, 30, Resolution.MEDIUM,
                OpenViduRecordingMode.NONE, false, false, true, Browser.EMULATED);
    }

    @Test
    void runOneSessionNxN_launchesSingleChunkWithoutManualAllocation() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.ONE_SESSION_NXN, Arrays.asList("6"), 1);

        CreateParticipantResponse response = orchestrator.runOneSessionNxN(testCase, 6);

        assertTrue(response.isResponseOk());
        verify(browserEmulatorClient).launchLoadTest("worker1", testCase, "session1", 6, 0, 0,
                Arrays.asList("User1", "User2", "User3", "User4", "User5", "User6"));
        verify(loadTestService, times(1)).setAndInitializeNextWorker(anyString(), eq(WorkerType.WORKER));
    }

    @Test
    void runOneSessionNxN_passesGeneratedParticipantIdsToWorker() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.ONE_SESSION_NXN, Arrays.asList("2"), 1);

        orchestrator.runOneSessionNxN(testCase, 2);

        verify(browserEmulatorClient).launchLoadTest("worker1", testCase, "session1", 2, 0, 0,
                Arrays.asList("User1", "User2"));
    }

    @Test
    void runOneSessionNxM_passesSeparatePublisherAndSubscriberIdsInOrder() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.ONE_SESSION_NXM, Arrays.asList("2:1"), 1);

        orchestrator.runOneSessionNxM(testCase, 2, 1);

        // Publisher ids are generated (and numbered) before subscriber ids within a chunk.
        verify(browserEmulatorClient).launchLoadTest("worker1", testCase, "session1", 2, 0, 1,
                Arrays.asList("User1", "User2", "User3"));
    }

    @Test
    void runOneSessionNxM_splitsIntoChunksWhenManualAllocationEnabled() throws NoWorkersAvailableException {
        when(loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(loadTestConfig.getUsersPerWorker()).thenReturn(4);
        TestCase testCase = testCase(Topology.ONE_SESSION_NXM, Arrays.asList("10:5"), 1);

        CreateParticipantResponse response = orchestrator.runOneSessionNxM(testCase, 10, 5);

        assertTrue(response.isResponseOk());
        verify(browserEmulatorClient).launchLoadTest("worker1", testCase, "session1", 4, 0, 0,
                Arrays.asList("User1", "User2", "User3", "User4"));
        verify(browserEmulatorClient).launchLoadTest("worker2", testCase, "session1", 4, 0, 0,
                Arrays.asList("User5", "User6", "User7", "User8"));
        verify(browserEmulatorClient).launchLoadTest("worker3", testCase, "session1", 2, 0, 2,
                Arrays.asList("User9", "User10", "User11", "User12"));
        verify(browserEmulatorClient).launchLoadTest("worker4", testCase, "session1", 0, 0, 3,
                Arrays.asList("User13", "User14", "User15"));
        verify(loadTestService, times(4)).setAndInitializeNextWorker(anyString(), eq(WorkerType.WORKER));
    }

    @Test
    void runNxN_createsOneRoomPerSession() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.N_X_N, Arrays.asList("3"), 2);

        CreateParticipantResponse response = orchestrator.runNxN(testCase, 3);

        assertTrue(response.isResponseOk());
        // Each room/session resets the synthetic user numbering, matching NORMAL mode.
        verify(browserEmulatorClient).launchLoadTest("worker1", testCase, "session1", 3, 0, 0,
                Arrays.asList("User1", "User2", "User3"));
        verify(browserEmulatorClient).launchLoadTest("worker2", testCase, "session2", 3, 0, 0,
                Arrays.asList("User1", "User2", "User3"));
    }

    @Test
    void runNxN_stopsAfterFirstFailedChunkAndSkipsRemainingSessions() throws NoWorkersAvailableException {
        when(browserEmulatorClient.launchLoadTest(anyString(), any(TestCase.class), anyString(), anyInt(), anyInt(),
                anyInt(), anyList())).thenReturn(false);
        TestCase testCase = testCase(Topology.N_X_N, Arrays.asList("3"), 2);

        CreateParticipantResponse response = orchestrator.runNxN(testCase, 3);

        assertFalse(response.isResponseOk());
        verify(browserEmulatorClient, times(1)).launchLoadTest(anyString(), any(TestCase.class), anyString(),
                anyInt(), anyInt(), anyInt(), anyList());
    }

    @Test
    void chunkSizingCoversFullRoomWhenNoManualAllocation() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.ONE_SESSION_NXM, Arrays.asList("10:5"), 1);

        orchestrator.runOneSessionNxM(testCase, 10, 5);

        verify(browserEmulatorClient, times(1)).launchLoadTest(anyString(), any(TestCase.class), anyString(),
                eq(10), eq(0), eq(5), anyList());
    }

    @Test
    void runNxM_infiniteSessionsKeepCreatingRoomsUntilNoMoreWorkers() throws NoWorkersAvailableException {
        mockWorkerPool("worker1", "worker2"); // only 2 workers -> 3rd session should fail
        TestCase testCase = testCase(Topology.N_X_M, Arrays.asList("2:1"), -1);

        assertThrows(NoWorkersAvailableException.class, () -> orchestrator.runNxM(testCase, 2, 1));

        verify(browserEmulatorClient).launchLoadTest("worker1", testCase, "session1", 2, 0, 1,
                Arrays.asList("User1", "User2", "User3"));
        verify(browserEmulatorClient).launchLoadTest("worker2", testCase, "session2", 2, 0, 1,
                Arrays.asList("User1", "User2", "User3"));
        verify(browserEmulatorClient, times(2)).launchLoadTest(anyString(), any(TestCase.class), anyString(),
                anyInt(), anyInt(), anyInt(), anyList());
    }

    @Test
    void runOneSessionNxN_infiniteParticipantsGrowInStepsUntilNoMoreWorkers() throws NoWorkersAvailableException {
        mockWorkerPool("worker1", "worker2", "worker3");
        when(loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(loadTestConfig.getUsersPerWorker()).thenReturn(5);
        TestCase testCase = testCase(Topology.ONE_SESSION_NXN, Arrays.asList("infinite"), 1);

        assertThrows(NoWorkersAvailableException.class,
                () -> orchestrator.runOneSessionNxN(testCase, Integer.MAX_VALUE));

        verify(browserEmulatorClient).launchLoadTest(eq("worker1"), eq(testCase), eq("session1"), eq(5), eq(0),
                eq(0), anyList());
        verify(browserEmulatorClient).launchLoadTest(eq("worker2"), eq(testCase), eq("session1"), eq(5), eq(0),
                eq(0), anyList());
        verify(browserEmulatorClient).launchLoadTest(eq("worker3"), eq(testCase), eq("session1"), eq(5), eq(0),
                eq(0), anyList());
        verify(browserEmulatorClient, times(3)).launchLoadTest(anyString(), any(TestCase.class), anyString(),
                anyInt(), anyInt(), anyInt(), anyList());
    }

    @Test
    void runOneSessionNxN_infiniteParticipantsDefaultChunkSizeWithoutManualAllocation()
            throws NoWorkersAvailableException {
        mockWorkerPool("worker1");
        TestCase testCase = testCase(Topology.ONE_SESSION_NXN, Arrays.asList("infinite"), 1);

        assertThrows(NoWorkersAvailableException.class,
                () -> orchestrator.runOneSessionNxN(testCase, Integer.MAX_VALUE));

        verify(browserEmulatorClient).launchLoadTest(eq("worker1"), eq(testCase), eq("session1"), eq(50), eq(0),
                eq(0), anyList());
    }

    @Test
    void runOneSessionNxM_infiniteSubscribersWithFixedPublishersGrowsSubscribersOnly()
            throws NoWorkersAvailableException {
        mockWorkerPool("worker1", "worker2");
        when(loadTestConfig.isManualParticipantsAllocation()).thenReturn(true);
        when(loadTestConfig.getUsersPerWorker()).thenReturn(10);
        TestCase testCase = testCase(Topology.ONE_SESSION_NXM, Arrays.asList("2:infinite"), 1);

        assertThrows(NoWorkersAvailableException.class,
                () -> orchestrator.runOneSessionNxM(testCase, 2, Integer.MAX_VALUE));

        // First chunk: fixed 2 publishers fill the remaining capacity with subscribers.
        verify(browserEmulatorClient).launchLoadTest(eq("worker1"), eq(testCase), eq("session1"), eq(2), eq(0),
                eq(8), anyList());
        // Subsequent chunks: publishers exhausted, pure-subscriber chunks continue.
        verify(browserEmulatorClient).launchLoadTest(eq("worker2"), eq(testCase), eq("session1"), eq(0), eq(0),
                eq(10), anyList());
    }

    @Test
    void runOneSessionNxM_recordsSessionAndParticipantsForReporting() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.ONE_SESSION_NXM, Arrays.asList("10:5"), 1);

        orchestrator.runOneSessionNxM(testCase, 10, 5);

        assertEquals(1, participantOrchestrator.getSessionNumber());
        assertEquals(15, participantOrchestrator.getTotalParticipants());
        assertEquals(15, participantOrchestrator.getUserStartTimes().size());
        // ONE_SESSION topologies don't track "completed" sessions in NORMAL mode either.
        assertEquals(0, participantOrchestrator.getSessionsCompleted());
    }

    @Test
    void runNxN_recordsOneCompletedSessionPerRoomForReporting() throws NoWorkersAvailableException {
        TestCase testCase = testCase(Topology.N_X_N, Arrays.asList("3"), 2);

        orchestrator.runNxN(testCase, 3);

        assertEquals(2, participantOrchestrator.getSessionNumber());
        assertEquals(2, participantOrchestrator.getSessionsCompleted());
        assertEquals(6, participantOrchestrator.getTotalParticipants());
        assertEquals(6, participantOrchestrator.getUserStartTimes().size());
    }

    @Test
    void runOneSessionNxM_stopsImmediatelyWhenMaxParticipantErrorsAlreadyReached() throws NoWorkersAvailableException {
        CreateParticipantResponse forcedStop = new CreateParticipantResponse()
                .setResponseOk(false)
                .setStopReason("Max participant errors reached (5)");
        when(browserEmulatorClient.getLastErrorReconnectingResponse()).thenReturn(forcedStop);
        TestCase testCase = testCase(Topology.ONE_SESSION_NXM, Arrays.asList("10:5"), 1);

        CreateParticipantResponse response = orchestrator.runOneSessionNxM(testCase, 10, 5);

        assertFalse(response.isResponseOk());
        assertEquals("Max participant errors reached (5)", response.getStopReason());
        verify(browserEmulatorClient, times(0)).launchLoadTest(anyString(), any(TestCase.class), anyString(),
                anyInt(), anyInt(), anyInt(), anyList());
    }

    @Test
    void runNxN_stopsBeforeStartingNextSessionWhenMaxParticipantErrorsReachedMidTest()
            throws NoWorkersAvailableException {
        CreateParticipantResponse forcedStop = new CreateParticipantResponse()
                .setResponseOk(false)
                .setStopReason("Max participant errors reached (3)");
        // First session launches fine (checkForcedStop is polled once per session
        // and once per chunk within it - two null answers cover session1's single
        // chunk); the stop signal only appears once we're about to start session2
        // (simulating an async WS error arriving mid-test).
        when(browserEmulatorClient.getLastErrorReconnectingResponse())
                .thenReturn(null, null, forcedStop);
        TestCase testCase = testCase(Topology.N_X_N, Arrays.asList("3"), 2);

        CreateParticipantResponse response = orchestrator.runNxN(testCase, 3);

        assertFalse(response.isResponseOk());
        assertEquals("Max participant errors reached (3)", response.getStopReason());
        verify(browserEmulatorClient, times(1)).launchLoadTest(anyString(), any(TestCase.class), anyString(),
                anyInt(), anyInt(), anyInt(), anyList());
        assertEquals(1, participantOrchestrator.getSessionsCompleted());
    }

    @Test
    void runNxN_doesNotRecordParticipantsOrCompletionForFailedChunk() throws NoWorkersAvailableException {
        when(browserEmulatorClient.launchLoadTest(anyString(), any(TestCase.class), anyString(), anyInt(), anyInt(),
                anyInt(), anyList())).thenReturn(false);
        TestCase testCase = testCase(Topology.N_X_N, Arrays.asList("3"), 2);

        orchestrator.runNxN(testCase, 3);

        assertEquals(0, participantOrchestrator.getSessionsCompleted());
        assertEquals(0, participantOrchestrator.getTotalParticipants());
        assertTrue(participantOrchestrator.getUserStartTimes().isEmpty());
    }
}
