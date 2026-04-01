package io.openvidu.loadtest.services.core;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import software.amazon.awssdk.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.NoWorkersAvailableException;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WorkerUrlResolver;

class LoadTestWorkerLifecycleOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(LoadTestWorkerLifecycleOrchestrator.class);

    private final LoadTestService loadTestService;
    private final Ec2Client ec2Client;
    private final LoadTestConfig loadTestConfig;
    private final WorkerUrlResolver workerUrlResolver;

    private int workersUsed = 0;
    private List<Date> workerStartTimes = new ArrayList<>();
    private List<Date> recordingWorkerStartTimes = new ArrayList<>();

    LoadTestWorkerLifecycleOrchestrator(LoadTestService loadTestService, Ec2Client ec2Client,
            LoadTestConfig loadTestConfig, WorkerUrlResolver workerUrlResolver) {
        this.loadTestService = loadTestService;
        this.ec2Client = ec2Client;
        this.loadTestConfig = loadTestConfig;
        this.workerUrlResolver = workerUrlResolver;
    }

    String setAndInitializeNextWorker(String actualCurrentWorkerUrl, WorkerType workerType)
            throws NoWorkersAvailableException {
        if (loadTestService.isProdMode()) {
            return getNextProdWorker(actualCurrentWorkerUrl, workerType);
        }
        return getNextDevWorker(actualCurrentWorkerUrl);
    }

    boolean launchInitialInstances() {
        if (loadTestService.isProdMode()) {
            loadTestService.getAwsWorkersList().addAll(ec2Client.launchAndCleanInitialInstances());
            loadTestService.getRecordingWorkersList().addAll(ec2Client.launchAndCleanInitialRecordingInstances());

            initializeInstances(loadTestService.getAwsWorkersList());
            initializeInstances(loadTestService.getRecordingWorkersList());

            workerStartTimes.addAll(loadTestService.getAwsWorkersList().stream().map(inst -> new Date()).toList());
            recordingWorkerStartTimes
                    .addAll(loadTestService.getRecordingWorkersList().stream().map(inst -> new Date()).toList());
            return !loadTestService.getAwsWorkersList().isEmpty()
                    || !loadTestService.getRecordingWorkersList().isEmpty();
        }

        initializeWorkerUrls(loadTestService.getDevWorkersList());
        return !loadTestService.getDevWorkersList().isEmpty();
    }

    private String getNextProdWorker(String actualCurrentWorkerUrl, WorkerType workerType)
            throws NoWorkersAvailableException {
        workersUsed++;

        List<Instance> workerList = getWorkerList(workerType);
        List<Date> workerStartTimesForType = getWorkerStartTimesForType(workerType);
        String workerTypeValue = workerType.getValue();

        if (actualCurrentWorkerUrl.isBlank()) {
            String workerUrl = workerUrlResolver.resolveUrl(workerList.get(0));
            log.info("Getting new {} already launched: {}", workerTypeValue, workerUrl);
            return workerUrl;
        }

        Instance nextInstance = findNextInstance(actualCurrentWorkerUrl, workerList);
        if (nextInstance != null) {
            String workerUrl = workerUrlResolver.resolveUrl(nextInstance);
            log.info("Getting new {} already launched: {}", workerTypeValue, workerUrl);
            return workerUrl;
        }

        return launchAndInitializeWorker(workerType, workerTypeValue, workerList, workerStartTimesForType);
    }

    private String getNextDevWorker(String actualCurrentWorkerUrl) throws NoWorkersAvailableException {
        List<String> devWorkers = loadTestService.getDevWorkersList();
        workersUsed = devWorkers.size();

        if (actualCurrentWorkerUrl.isBlank()) {
            return devWorkers.get(0);
        }

        int index = devWorkers.indexOf(actualCurrentWorkerUrl);
        if (index + 1 >= devWorkers.size()) {
            throwNoMoreWorkersAvailable();
        }
        return devWorkers.get(index + 1);
    }

    private String launchAndInitializeWorker(WorkerType workerType, String workerTypeValue,
            List<Instance> workerList, List<Date> workerStartTimesForType)
            throws NoWorkersAvailableException {
        if (loadTestConfig.getWorkersRumpUp() == 0) {
            throwNoMoreWorkersAvailable();
        }

        log.info("Launching a new Ec2 instance... ");
        List<Instance> nextInstanceList = ec2Client.launchInstance(loadTestConfig.getWorkersRumpUp(), workerType);
        initializeInstances(nextInstanceList);

        workerList.addAll(nextInstanceList);
        workerStartTimesForType.addAll(nextInstanceList.stream().map(instance -> new Date()).toList());

        String newWorkerUrl = workerUrlResolver.resolveUrl(nextInstanceList.get(0));
        log.info("New {} has been launched: {}", workerTypeValue, newWorkerUrl);
        return newWorkerUrl;
    }

    private void initializeInstances(List<Instance> instances) {
        if (instances.isEmpty()) {
            return;
        }
        List<String> urls = workerUrlResolver.resolveUrls(instances);
        initializeWorkerUrls(urls);
    }

    private void initializeWorkerUrls(List<String> workerUrls) {
        if (workerUrls.isEmpty()) {
            return;
        }

        List<Future<?>> futures = new java.util.ArrayList<>(workerUrls.size());
        try (ExecutorService executorService = Executors.newFixedThreadPool(workerUrls.size())) {
            for (String workerUrl : workerUrls) {
                futures.add(executorService.submit(() -> loadTestService.initializeInstance(workerUrl)));
            }
            waitForInitialization(futures);
        }
    }

    private void waitForInitialization(List<Future<?>> futures) {
        for (Future<?> future : futures) {
            try {
                future.get();
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                log.error("Instance initialization interrupted: {}", ie.getMessage());
            } catch (ExecutionException ee) {
                log.error("Error while initializing instance: {}", ee.getMessage());
            }
        }
    }

    private Instance findNextInstance(String actualCurrentWorkerUrl, List<Instance> workerList) {
        int currentIndex = 0;
        for (int i = 0; i < workerList.size(); i++) {
            if (actualCurrentWorkerUrl.equals(workerUrlResolver.resolveUrl(workerList.get(i)))) {
                currentIndex = i;
                break;
            }
        }
        int nextIndex = currentIndex + 1;
        return nextIndex >= workerList.size() ? null : workerList.get(nextIndex);
    }

    private List<Instance> getWorkerList(WorkerType workerType) {
        if (workerType.equals(WorkerType.RECORDING_WORKER)) {
            return loadTestService.getRecordingWorkersList();
        }
        return loadTestService.getAwsWorkersList();
    }

    private List<Date> getWorkerStartTimesForType(WorkerType workerType) {
        if (workerType.equals(WorkerType.RECORDING_WORKER)) {
            return recordingWorkerStartTimes;
        }
        return workerStartTimes;
    }

    private void throwNoMoreWorkersAvailable() throws NoWorkersAvailableException {
        String message = "No more workers available";
        log.error("{}. Exiting", message);
        throw new NoWorkersAvailableException(message + ". Exiting");
    }

    int getWorkersUsed() {
        return workersUsed;
    }

    List<Date> getWorkerStartTimes() {
        return workerStartTimes;
    }

    List<Date> getRecordingWorkerStartTimes() {
        return recordingWorkerStartTimes;
    }

    void cleanup() {
        workersUsed = 0;
        workerStartTimes = new ArrayList<>();
        recordingWorkerStartTimes = new ArrayList<>();
    }
}
