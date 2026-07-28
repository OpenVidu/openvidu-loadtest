package io.openvidu.loadtest.services.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import io.openvidu.loadtest.models.testcase.Browser;
import io.openvidu.loadtest.models.testcase.EgressConfig;
import io.openvidu.loadtest.models.testcase.EgressJob;
import io.openvidu.loadtest.models.testcase.EgressType;
import io.openvidu.loadtest.models.testcase.OpenViduRecordingMode;
import io.openvidu.loadtest.models.testcase.Resolution;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.LiveKitEgressClient;
import io.openvidu.loadtest.services.LiveKitEgressClient.ParticipantTracks;
import io.openvidu.loadtest.services.Sleeper;

class LoadTestEgressOrchestratorTest {

    private static final List<String> THREE_ROOMS = List.of("session1", "session2", "session3");

    @Mock
    private LiveKitEgressClient egressClient;
    @Mock
    private Sleeper sleeper;

    private LoadTestEgressOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(egressClient.isAvailable()).thenReturn(true);
        orchestrator = new LoadTestEgressOrchestrator(egressClient, sleeper);
    }

    private TestCase testCaseWith(EgressConfig egress) {
        TestCase testCase = new TestCase("N:N", List.of("8"), 3, 30, Resolution.MEDIUM,
                OpenViduRecordingMode.NONE, false, false, true, Browser.EMULATED);
        testCase.setEgress(egress);
        return testCase;
    }

    private EgressConfig config(EgressType type, int rooms, int jobsPerRoom) {
        return new EgressConfig(type, rooms, jobsPerRoom, 0, "", "grid", false, "MP4", "run");
    }

    @Test
    void doesNothingWhenTestCaseHasNoEgressBlock() {
        orchestrator.startEgressIfConfigured(testCaseWith(EgressConfig.disabled()), THREE_ROOMS);

        verifyNoInteractions(egressClient);
        assertTrue(orchestrator.getJobs().isEmpty());
    }

    @Test
    void roomCompositeStartsOneJobPerRoom() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1", "EG_2", "EG_3");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 0, 1)), THREE_ROOMS);

        verify(egressClient).startRoomComposite(eq("session1"), any());
        verify(egressClient).startRoomComposite(eq("session2"), any());
        verify(egressClient).startRoomComposite(eq("session3"), any());
        assertEquals(3, orchestrator.getJobs().size());
        assertTrue(orchestrator.getJobs().stream().allMatch(EgressJob::isStarted));
    }

    @Test
    void recordsOnlyTheRequestedNumberOfRooms() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 2, 1)), THREE_ROOMS);

        verify(egressClient, times(2)).startRoomComposite(anyString(), any());
        verify(egressClient, never()).startRoomComposite(eq("session3"), any());
    }

    @Test
    void roomCompositeIgnoresJobsPerRoomBecauseItProducesOneOutput() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 1, 5)), THREE_ROOMS);

        verify(egressClient, times(1)).startRoomComposite(anyString(), any());
    }

    @Test
    void participantEgressStartsOneJobPerRequestedParticipant() throws Exception {
        when(egressClient.listParticipants("session1")).thenReturn(List.of(
                new ParticipantTracks("User1", "TR_A1", "TR_V1"),
                new ParticipantTracks("User2", "TR_A2", "TR_V2"),
                new ParticipantTracks("User3", "TR_A3", "TR_V3")));
        when(egressClient.startParticipant(anyString(), anyString(), any())).thenReturn("EG_P");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.PARTICIPANT, 1, 2)), THREE_ROOMS);

        verify(egressClient).startParticipant(eq("session1"), eq("User1"), any());
        verify(egressClient).startParticipant(eq("session1"), eq("User2"), any());
        verify(egressClient, never()).startParticipant(anyString(), eq("User3"), any());
        assertEquals(2, orchestrator.getJobs().size());
        assertEquals("User1", orchestrator.getJobs().get(0).getTarget());
        assertEquals("User2", orchestrator.getJobs().get(1).getTarget());
    }

    @Test
    void trackEgressStartsOneJobPerTrack() throws Exception {
        when(egressClient.listParticipants("session1"))
                .thenReturn(List.of(new ParticipantTracks("User1", "TR_A1", "TR_V1")));
        when(egressClient.startTrack(anyString(), anyString(), any())).thenReturn("EG_T");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.TRACK, 1, 1)), THREE_ROOMS);

        // A publisher has two tracks, so a single participant produces two jobs
        assertEquals(2, orchestrator.getJobs().size());
        verify(egressClient).startTrack(eq("session1"), eq("TR_V1"), any());
        verify(egressClient).startTrack(eq("session1"), eq("TR_A1"), any());
    }

    @Test
    void trackEgressRecordsOnlyAudioWhenAudioOnly() throws Exception {
        when(egressClient.listParticipants("session1"))
                .thenReturn(List.of(new ParticipantTracks("User1", "TR_A1", "TR_V1")));
        when(egressClient.startTrack(anyString(), anyString(), any())).thenReturn("EG_T");
        EgressConfig audioOnly = new EgressConfig(EgressType.TRACK, 1, 1, 0, "", "grid", true, "OGG", "run");

        orchestrator.startEgressIfConfigured(testCaseWith(audioOnly), THREE_ROOMS);

        assertEquals(1, orchestrator.getJobs().size());
        verify(egressClient).startTrack(eq("session1"), eq("TR_A1"), any());
        verify(egressClient, never()).startTrack(anyString(), eq("TR_V1"), any());
    }

    @Test
    void trackCompositeSkipsParticipantsWithoutBothTracks() throws Exception {
        when(egressClient.listParticipants("session1")).thenReturn(List.of(
                new ParticipantTracks("SubscriberOnly", "", ""),
                new ParticipantTracks("AudioOnly", "TR_A", ""),
                new ParticipantTracks("Publisher", "TR_A2", "TR_V2")));
        when(egressClient.startTrackComposite(anyString(), any(), any())).thenReturn("EG_TC");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.TRACK_COMPOSITE, 1, 1)), THREE_ROOMS);

        assertEquals(1, orchestrator.getJobs().size());
        assertEquals("Publisher", orchestrator.getJobs().get(0).getTarget());
    }

    @Test
    void participantEgressAcceptsAudioOnlyPublishers() throws Exception {
        when(egressClient.listParticipants("session1")).thenReturn(List.of(
                new ParticipantTracks("SubscriberOnly", "", ""),
                new ParticipantTracks("AudioOnly", "TR_A", "")));
        when(egressClient.startParticipant(anyString(), anyString(), any())).thenReturn("EG_P");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.PARTICIPANT, 1, 1)), THREE_ROOMS);

        assertEquals(1, orchestrator.getJobs().size());
        assertEquals("AudioOnly", orchestrator.getJobs().get(0).getTarget());
    }

    @Test
    void recordsAFailedJobWithoutStoppingTheTest() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any()))
                .thenReturn("EG_1")
                .thenThrow(new IOException("egress service unavailable"))
                .thenReturn("EG_3");

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 0, 1)), THREE_ROOMS);

        List<EgressJob> jobs = orchestrator.getJobs();
        assertEquals(3, jobs.size());
        assertTrue(jobs.get(0).isStarted());
        assertFalse(jobs.get(1).isStarted());
        assertEquals("egress service unavailable", jobs.get(1).getError());
        assertTrue(jobs.get(2).isStarted());
    }

    @Test
    void recordsAFailureWhenARoomHasNoSuitableParticipant() throws Exception {
        when(egressClient.listParticipants("session1")).thenReturn(List.of());

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.PARTICIPANT, 1, 1)), THREE_ROOMS);

        assertEquals(1, orchestrator.getJobs().size());
        assertFalse(orchestrator.getJobs().get(0).isStarted());
        assertNotNull(orchestrator.getJobs().get(0).getError());
    }

    @Test
    void skipsRecordingOnANonLiveKitPlatform() throws Exception {
        when(egressClient.isAvailable()).thenReturn(false);

        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 0, 1)), THREE_ROOMS);

        verify(egressClient, never()).startRoomComposite(anyString(), any());
        assertTrue(orchestrator.getJobs().isEmpty());
    }

    @Test
    void skipsRecordingWhenNoRoomWasCreated() throws Exception {
        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 0, 1)), List.of());

        verify(egressClient, never()).startRoomComposite(anyString(), any());
        assertTrue(orchestrator.getJobs().isEmpty());
    }

    @Test
    void waitsBeforeStartingWhenConfigured() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1");
        EgressConfig delayed = new EgressConfig(EgressType.ROOM_COMPOSITE, 1, 1, 45, "", "grid", false, "MP4", "run");

        orchestrator.startEgressIfConfigured(testCaseWith(delayed), THREE_ROOMS);

        verify(sleeper).sleep(eq(45), anyString());
    }

    @Test
    void stopsEveryStartedJobAndTimestampsIt() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1", "EG_2", "EG_3");
        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 0, 1)), THREE_ROOMS);

        orchestrator.stopAllEgress();

        verify(egressClient).stopEgress("EG_1");
        verify(egressClient).stopEgress("EG_2");
        verify(egressClient).stopEgress("EG_3");
        assertTrue(orchestrator.getJobs().stream().allMatch(job -> job.getStoppedAt() != null));
    }

    @Test
    void doesNotTryToStopJobsThatNeverStarted() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenThrow(new IOException("nope"));
        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 1, 1)), THREE_ROOMS);

        orchestrator.stopAllEgress();

        verify(egressClient, never()).stopEgress(anyString());
    }

    @Test
    void keepsStoppingRemainingJobsWhenOneStopFails() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1", "EG_2");
        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 2, 1)), THREE_ROOMS);
        org.mockito.Mockito.doThrow(new IOException("already ended")).when(egressClient).stopEgress("EG_1");

        orchestrator.stopAllEgress();

        verify(egressClient).stopEgress("EG_2");
        assertEquals("Could not stop recording: already ended", orchestrator.getJobs().get(0).getError());
        assertNotNull(orchestrator.getJobs().get(1).getStoppedAt());
    }

    @Test
    void stoppingTwiceStopsEachJobOnce() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1");
        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 1, 1)), THREE_ROOMS);

        orchestrator.stopAllEgress();
        orchestrator.stopAllEgress();

        verify(egressClient, times(1)).stopEgress("EG_1");
    }

    @Test
    void cleanupForgetsPreviousTestCaseJobs() throws Exception {
        when(egressClient.startRoomComposite(anyString(), any())).thenReturn("EG_1");
        orchestrator.startEgressIfConfigured(testCaseWith(config(EgressType.ROOM_COMPOSITE, 1, 1)), THREE_ROOMS);

        orchestrator.cleanup();

        assertTrue(orchestrator.getJobs().isEmpty());
    }
}
