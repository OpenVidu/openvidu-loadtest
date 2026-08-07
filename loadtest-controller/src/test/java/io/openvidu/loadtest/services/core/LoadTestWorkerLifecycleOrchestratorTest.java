package io.openvidu.loadtest.services.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import software.amazon.awssdk.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WorkerUrlResolver;

class LoadTestWorkerLifecycleOrchestratorTest {

    private LoadTestService loadTestService;
    private Ec2Client ec2Client;
    private LoadTestConfig loadTestConfig;
    private WorkerUrlResolver workerUrlResolver;
    private LoadTestWorkerLifecycleOrchestrator orchestrator;

    private Instance worker1;
    private Instance worker2;
    private List<Instance> workerList;

    @BeforeEach
    void setUp() {
        loadTestService = mock(LoadTestService.class);
        ec2Client = mock(Ec2Client.class);
        loadTestConfig = mock(LoadTestConfig.class);
        workerUrlResolver = mock(WorkerUrlResolver.class);
        orchestrator = new LoadTestWorkerLifecycleOrchestrator(loadTestService, ec2Client, loadTestConfig,
                workerUrlResolver);

        worker1 = Instance.builder().instanceId("i-11111111111111111").build();
        worker2 = Instance.builder().instanceId("i-22222222222222222").build();
        workerList = new ArrayList<>(List.of(worker1, worker2));

        when(loadTestService.isProdMode()).thenReturn(true);
        when(loadTestService.getAwsWorkersList()).thenReturn(workerList);
        when(workerUrlResolver.resolveUrl(worker1)).thenReturn("https://worker1.example.com:5000");
        when(workerUrlResolver.resolveUrl(worker2)).thenReturn("https://worker2.example.com:5000");
    }

    @Test
    void packWorkers_wrapsAroundFleetInsteadOfLaunching() throws Exception {
        when(loadTestConfig.isPackWorkers()).thenReturn(true);

        String next = orchestrator.setAndInitializeNextWorker("https://worker2.example.com:5000", WorkerType.WORKER);

        assertEquals("https://worker1.example.com:5000", next);
        verify(ec2Client, never()).launchInstance(anyInt(), any());
    }

    @Test
    void packWorkers_stillAdvancesThroughFleetBeforeWrapping() throws Exception {
        when(loadTestConfig.isPackWorkers()).thenReturn(true);

        String next = orchestrator.setAndInitializeNextWorker("https://worker1.example.com:5000", WorkerType.WORKER);

        assertEquals("https://worker2.example.com:5000", next);
        verify(ec2Client, never()).launchInstance(anyInt(), any());
    }

    @Test
    void launchInitialInstances_reusesWarmFleetInsteadOfRelaunching() {
        boolean ok = orchestrator.launchInitialInstances();

        assertTrue(ok);
        verify(ec2Client, never()).launchAndCleanInitialInstances();
    }

    @Test
    void launchInitialInstances_launchesWhenNoFleetExists() {
        workerList.clear();
        when(loadTestService.getRecordingWorkersList()).thenReturn(new ArrayList<>());
        when(ec2Client.launchAndCleanInitialInstances()).thenReturn(List.of(worker1));
        when(ec2Client.launchAndCleanInitialRecordingInstances()).thenReturn(List.of());
        when(workerUrlResolver.resolveUrls(any())).thenReturn(List.of("https://worker1.example.com:5000"));

        boolean ok = orchestrator.launchInitialInstances();

        assertTrue(ok);
        verify(ec2Client).launchAndCleanInitialInstances();
    }

    @Test
    void withoutPackWorkers_exhaustedFleetLaunchesOrFails() {
        when(loadTestConfig.isPackWorkers()).thenReturn(false);
        when(loadTestConfig.getWorkersRumpUp()).thenReturn(0);

        assertThrows(NoWorkersAvailableException.class, () -> orchestrator
                .setAndInitializeNextWorker("https://worker2.example.com:5000", WorkerType.WORKER));
    }
}
