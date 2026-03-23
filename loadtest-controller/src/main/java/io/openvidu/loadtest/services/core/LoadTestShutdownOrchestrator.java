package io.openvidu.loadtest.services.core;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;

import software.amazon.awssdk.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WebSocketClient;

class LoadTestShutdownOrchestrator {

    private final LoadTestService loadTestService;
    private final BrowserEmulatorClient browserEmulatorClient;
    private final Ec2Client ec2Client;
    private final LoadTestConfig loadTestConfig;

    private Queue<WebSocketClient> wsSessions = new ConcurrentLinkedQueue<>();
    private List<Long> workerTimes = new ArrayList<>();
    private List<Long> recordingWorkerTimes = new ArrayList<>();

    LoadTestShutdownOrchestrator(LoadTestService loadTestService, BrowserEmulatorClient browserEmulatorClient,
            Ec2Client ec2Client, LoadTestConfig loadTestConfig) {
        this.loadTestService = loadTestService;
        this.browserEmulatorClient = browserEmulatorClient;
        this.ec2Client = ec2Client;
        this.loadTestConfig = loadTestConfig;
    }

    void disconnectAllSessions() {
        closeAllWebsocketSessions(wsSessions);

        List<String> workerUrls = collectWorkerUrls();
        browserEmulatorClient.disconnectAll(workerUrls);

        calculateQoeIfEnabled();

        if (loadTestService.isProdMode()) {
            stopAndResetWorkers();
        }

        Date stopDate = new Date();
        workerTimes = calculateWorkerTimes(loadTestService.getWorkerLifecycleOrchestratorWorkerStartTimes(), stopDate);
        recordingWorkerTimes = calculateWorkerTimes(
                loadTestService.getWorkerLifecycleOrchestratorRecordingWorkerStartTimes(), stopDate);
    }

    private void closeAllWebsocketSessions(Queue<WebSocketClient> wsSessions) {
        for (WebSocketClient ws : wsSessions) {
            if (ws != null) {
                ws.markForFullDeletion();
            }
        }
        for (WebSocketClient ws : wsSessions) {
            if (ws != null) {
                ws.close();
            }
        }
        wsSessions.clear();
    }

    private List<String> collectWorkerUrls() {
        List<String> workerUrls = new ArrayList<>(loadTestService.getDevWorkersList());
        if (!loadTestService.isProdMode()) {
            return workerUrls;
        }

        for (Instance ec2 : loadTestService.getAwsWorkersList()) {
            workerUrls.add(ec2.publicDnsName());
        }
        for (Instance recordingEc2 : loadTestService.getRecordingWorkersList()) {
            workerUrls.add(recordingEc2.publicDnsName());
        }
        return workerUrls;
    }

    private void calculateQoeIfEnabled() {
        if (loadTestConfig.isQoeAnalysisRecordings() && loadTestConfig.isQoeAnalysisInSitu()) {
            List<Instance> allWorkers = new ArrayList<>(loadTestService.getAwsWorkersList());
            allWorkers.addAll(loadTestService.getRecordingWorkersList());
            browserEmulatorClient.calculateQoe(allWorkers);
        }
    }

    private void stopAndResetWorkers() {
        ec2Client.stopInstance(loadTestService.getRecordingWorkersList());
        ec2Client.stopInstance(loadTestService.getAwsWorkersList());
        loadTestService.resetProdWorkers();
    }

    private List<Long> calculateWorkerTimes(List<Date> workerStartTimes, Date stopDate) {
        return workerStartTimes.stream()
                .map(workerStartTime -> TimeUnit.MINUTES.convert(stopDate.getTime() - workerStartTime.getTime(),
                        TimeUnit.MILLISECONDS))
                .toList();
    }

    void addWebSocketSession(WebSocketClient ws) {
        wsSessions.add(ws);
    }

    List<Long> getWorkerTimes() {
        return workerTimes;
    }

    List<Long> getRecordingWorkerTimes() {
        return recordingWorkerTimes;
    }

    void cleanup() {
        wsSessions.clear();
        workerTimes = new ArrayList<>();
        recordingWorkerTimes = new ArrayList<>();
    }
}
