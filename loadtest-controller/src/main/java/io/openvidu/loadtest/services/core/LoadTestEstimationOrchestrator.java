package io.openvidu.loadtest.services.core;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Sleeper;

class LoadTestEstimationOrchestrator {
    private static final Logger log = LoggerFactory.getLogger(LoadTestEstimationOrchestrator.class);

    private final LoadTestService loadTestService;
    private final BrowserEmulatorClient browserEmulatorClient;
    private final LoadTestConfig loadTestConfig;
    private final Sleeper sleeper;

    private int browserEstimation = -1;

    LoadTestEstimationOrchestrator(LoadTestService loadTestService,
            BrowserEmulatorClient browserEmulatorClient,
            LoadTestConfig loadTestConfig,
            Sleeper sleeper) {
        this.loadTestService = loadTestService;
        this.browserEmulatorClient = browserEmulatorClient;
        this.loadTestConfig = loadTestConfig;
        this.sleeper = sleeper;
    }

    boolean estimate(boolean instancesInitialized, String workerUrl, TestCase testCase, int publishers,
            int subscribers) {
        log.info("Starting browser estimation of CPU usage");
        if (!instancesInitialized) {
            loadTestService.initializeInstance(workerUrl);
        }

        int iteration = 0;
        while (true) {
            Integer overloadedPosition = estimatePublishers(workerUrl, testCase, publishers, subscribers, iteration);
            if (overloadedPosition != null) {
                return finishEstimation(workerUrl, overloadedPosition);
            }

            overloadedPosition = estimateSubscribers(workerUrl, testCase, publishers, subscribers, iteration);
            if (overloadedPosition != null) {
                return finishEstimation(workerUrl, overloadedPosition);
            }
            iteration++;
        }
    }

    private Integer estimatePublishers(String workerUrl, TestCase testCase, int publishers, int subscribers,
            int iteration) {
        for (int i = 0; i < publishers; i++) {
            CreateParticipantResponse response = browserEmulatorClient.createPublisher(workerUrl, iteration + i, 0,
                    testCase);
            if (!response.isResponseOk()) {
                log.error("Response status is not 200 OK. Exiting");
                return -1;
            }

            if (response.getWorkerCpuPct() > loadTestConfig.getWorkerMaxLoad()) {
                return iteration * (publishers + subscribers) + i + 1;
            }
            sleeper.sleep(5, "sleep between participants in estimation");
        }
        return null;
    }

    private Integer estimateSubscribers(String workerUrl, TestCase testCase, int publishers, int subscribers,
            int iteration) {
        for (int i = 0; i < subscribers; i++) {
            CreateParticipantResponse response = browserEmulatorClient.createSubscriber(
                    workerUrl,
                    iteration + publishers + i, 0,
                    testCase);
            if (!response.isResponseOk()) {
                log.error("Response status is not 200 OK. Exiting");
                return -1;
            }

            if (response.getWorkerCpuPct() >= loadTestConfig.getWorkerMaxLoad()) {
                return iteration * (publishers + subscribers) + publishers + i + 1;
            }
            sleeper.sleep(5, "sleep between participants in estimation");
        }
        return null;
    }

    private boolean finishEstimation(String workerUrl, int overloadedPosition) {
        if (overloadedPosition < 0) {
            return false;
        }
        browserEstimation = overloadedPosition;
        log.info("Browser estimation: {} browsers per worker.", overloadedPosition);
        browserEmulatorClient.disconnectAll(List.of(workerUrl));
        return true;
    }

    int getBrowserEstimation() {
        return browserEstimation;
    }

    void setBrowserEstimation(int value) {
        this.browserEstimation = value;
    }

    void cleanup() {
        browserEstimation = -1;
    }
}
