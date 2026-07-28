package io.openvidu.loadtest.services.core;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.WorkerUrlResolver;
import io.openvidu.loadtest.utils.DataIO;

/**
 * Covers how a test case's {@code participants} list turns into load points:
 * every element of the list is its own scenario, as the configuration schema
 * and README promise.
 */
class LoadTestTopologyOrchestratorTest {

    @Mock
    private LoadTestService loadTestService;
    @Mock
    private LoadTestConfig loadTestConfig;
    @Mock
    private KibanaClient kibanaClient;
    @Mock
    private BrowserEmulatorClient browserEmulatorClient;
    @Mock
    private WorkerUrlResolver workerUrlResolver;
    @Mock
    private DataIO dataIO;
    @Mock
    private LoadTestModeOrchestrator modeOrchestrator;

    private LoadTestTopologyOrchestrator orchestrator;

    @BeforeEach
    void setUp() throws NoWorkersAvailableException {
        MockitoAnnotations.openMocks(this);
        orchestrator = new LoadTestTopologyOrchestrator(loadTestService, loadTestConfig, kibanaClient,
                browserEmulatorClient, workerUrlResolver, dataIO, modeOrchestrator);

        when(loadTestService.hasInitialWorkersAvailable()).thenReturn(true);
        when(loadTestService.launchInitialInstances()).thenReturn(true);
        when(loadTestService.checkEnoughWorkers(anyInt(), anyInt())).thenReturn(true);
        when(loadTestConfig.isExitOnEnd()).thenReturn(false);
        when(loadTestConfig.isTerminateWorkers()).thenReturn(false);

        CreateParticipantResponse ok = new CreateParticipantResponse().setResponseOk(true);
        when(modeOrchestrator.runNxN(any(), anyInt())).thenReturn(ok);
        when(modeOrchestrator.runNxM(any(), anyInt(), anyInt())).thenReturn(ok);
        when(modeOrchestrator.runTeaching(any(), anyInt(), anyInt())).thenReturn(ok);
        when(modeOrchestrator.runOneSessionNxN(any(), anyInt())).thenReturn(ok);
        when(modeOrchestrator.runOneSessionNxM(any(), anyInt(), anyInt())).thenReturn(ok);
    }

    private TestCase emulatedTestCase(Topology topology, List<String> participants, int sessions) {
        return new TestCase(topology.getValue(), participants, sessions, 30, Resolution.MEDIUM,
                OpenViduRecordingMode.NONE, false, false, true, Browser.EMULATED);
    }

    @Test
    void nxNRunsOneScenarioPerParticipantsEntry() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.N_X_N, List.of("4", "8", "16"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator).runNxN(testCase, 4);
        verify(modeOrchestrator).runNxN(testCase, 8);
        verify(modeOrchestrator).runNxN(testCase, 16);
        verify(modeOrchestrator, times(3)).runNxN(any(), anyInt());
    }

    @Test
    void nxMRunsOneScenarioPerParticipantsEntry() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.N_X_M, List.of("1:25", "1:75", "1:150"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator).runNxM(testCase, 1, 25);
        verify(modeOrchestrator).runNxM(testCase, 1, 75);
        verify(modeOrchestrator).runNxM(testCase, 1, 150);
        verify(modeOrchestrator, times(3)).runNxM(any(), anyInt(), anyInt());
    }

    @Test
    void oneSessionNxNRunsOneScenarioPerParticipantsEntry() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.ONE_SESSION_NXN, List.of("4", "30", "50"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator).runOneSessionNxN(testCase, 4);
        verify(modeOrchestrator).runOneSessionNxN(testCase, 30);
        verify(modeOrchestrator).runOneSessionNxN(testCase, 50);
    }

    @Test
    void oneSessionNxMRunsOneScenarioPerParticipantsEntry() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.ONE_SESSION_NXM, List.of("10:50", "10:100"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator).runOneSessionNxM(testCase, 10, 50);
        verify(modeOrchestrator).runOneSessionNxM(testCase, 10, 100);
        verify(modeOrchestrator, times(2)).runOneSessionNxM(any(), anyInt(), anyInt());
    }

    @Test
    void infiniteEntryIsRunAlongsideFiniteOnes() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.ONE_SESSION_NXN, List.of("10", "infinite"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator).runOneSessionNxN(testCase, 10);
        verify(modeOrchestrator).runOneSessionNxN(testCase, Integer.MAX_VALUE);
    }

    @Test
    void teachingUsesItsOwnGeometryInsteadOfNxM() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.TEACHING, List.of("1:100", "1:300"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator).runTeaching(testCase, 1, 100);
        verify(modeOrchestrator).runTeaching(testCase, 1, 300);
        verify(modeOrchestrator, never()).runNxM(any(), anyInt(), anyInt());
    }

    @Test
    void everyScenarioGetsItsOwnReport() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.N_X_N, List.of("4", "8", "16"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        // A report per load point is what makes each point separately measurable
        verify(loadTestService).completeTestAndSave(eq(testCase), eq("4"), any());
        verify(loadTestService).completeTestAndSave(eq(testCase), eq("8"), any());
        verify(loadTestService).completeTestAndSave(eq(testCase), eq("16"), any());
    }

    @Test
    void eachScenarioStartsItsOwnMeasurementWindow() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.N_X_N, List.of("4", "8"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(loadTestService, times(2)).setStartTimeNow();
    }

    @Test
    void everyScenarioTearsDownItsParticipantsBeforeTheNextOne() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.N_X_N, List.of("4", "8", "16"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(loadTestService, times(3)).cleanupAfterParticipantConfiguration();
    }

    @Test
    void resultsAreExportedOnce() throws NoWorkersAvailableException {
        TestCase testCase = emulatedTestCase(Topology.N_X_N, List.of("4", "8"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(dataIO).exportAllResults(any(), anyString());
    }

    @Test
    void stopsWhenNoWorkerIsAvailableAtAll() throws NoWorkersAvailableException {
        when(loadTestService.hasInitialWorkersAvailable()).thenReturn(false);
        TestCase testCase = emulatedTestCase(Topology.N_X_N, List.of("4"), 1);

        orchestrator.startLoadTests(List.of(testCase));

        verify(modeOrchestrator, never()).runNxN(any(), anyInt());
    }
}
