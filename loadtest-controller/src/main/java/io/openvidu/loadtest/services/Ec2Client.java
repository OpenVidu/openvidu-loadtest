package io.openvidu.loadtest.services;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.ec2.model.BlockDeviceMapping;
import software.amazon.awssdk.services.ec2.model.DescribeInstancesRequest;
import software.amazon.awssdk.services.ec2.model.DescribeInstancesResponse;
import software.amazon.awssdk.services.ec2.model.EbsBlockDevice;
import software.amazon.awssdk.services.ec2.model.Filter;
import software.amazon.awssdk.services.ec2.model.InstanceStateName;
import software.amazon.awssdk.services.ec2.model.Placement;
import software.amazon.awssdk.services.ec2.model.RebootInstancesRequest;
import software.amazon.awssdk.services.ec2.model.Reservation;
import software.amazon.awssdk.services.ec2.model.ResourceType;
import software.amazon.awssdk.services.ec2.model.RunInstancesRequest;
import software.amazon.awssdk.services.ec2.model.RunInstancesResponse;
import software.amazon.awssdk.services.ec2.model.StartInstancesRequest;
import software.amazon.awssdk.services.ec2.model.StopInstancesRequest;
import software.amazon.awssdk.services.ec2.model.Tag;
import software.amazon.awssdk.services.ec2.model.TagSpecification;
import software.amazon.awssdk.services.ec2.model.TerminateInstancesRequest;
import software.amazon.awssdk.services.ec2.model.Instance;
import software.amazon.awssdk.services.ec2.model.InstanceState;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.exceptions.LoadTestInitializationException;
import io.openvidu.loadtest.models.testcase.WorkerType;

@Service
public class Ec2Client {

    private static final String WAITING_FOR_INSTANCES_TO_BE_READY = "Waiting for instances to be ready";

    private static final Logger log = LoggerFactory.getLogger(Ec2Client.class);

    private String amiId = "";
    private String instanceType = "";
    private String securityGroupId = "";
    private int workersNumberAtTheBeginning;
    private int recordingWorkersNumberAtTheBeginning;
    private int workersRampUp;

    private static final Tag NAME_TAG = Tag.builder().key("Name").value("Worker").build();
    private static final Tag RECORDING_NAME_TAG = Tag.builder().key("Name").value("Recording Worker").build();
    private static final Tag LOADTEST_WORKER_TAG = Tag.builder().key("Type").value("OpenViduLoadTest").build();
    private static final Tag RECORDING_TAG = Tag.builder().key("Type").value("RecordingLoadTest").build();

    private static final int WAIT_RUNNING_STATE_S = 5;

    private software.amazon.awssdk.services.ec2.Ec2Client awsEc2Client;
    private String endpointOverride = null;

    private LoadTestConfig loadTestConfig;
    private Sleeper sleeper;

    public Ec2Client(LoadTestConfig loadTestConfig, Sleeper sleeper) {
        this.loadTestConfig = loadTestConfig;
        this.sleeper = sleeper;
    }

    /**
     * Set endpoint override for testing (e.g., Floci).
     * This must be called before init() or the client needs to be reinitialized.
     */
    public void setEndpointOverride(String endpoint) {
        endpointOverride = endpoint;
        log.info("EC2 client endpoint override set to: {}", endpoint);
    }

    @PostConstruct
    public void init() {
        String instanceRegion = "";
        amiId = this.loadTestConfig.getWorkerAmiId();
        instanceType = this.loadTestConfig.getWorkerInstanceType();
        securityGroupId = this.loadTestConfig.getWorkerSecurityGroupId();
        instanceRegion = this.loadTestConfig.getWorkerInstanceRegion();
        workersNumberAtTheBeginning = this.loadTestConfig.getWorkersNumberAtTheBeginning();
        recordingWorkersNumberAtTheBeginning = this.loadTestConfig.getRecordingWorkersNumberAtTheBeginning();
        workersRampUp = this.loadTestConfig.getWorkersRumpUp();

        if (!this.loadTestConfig.getAwsAccessKey().isBlank()
                && !this.loadTestConfig.getAwsSecretAccessKey().isBlank()) {
            AwsBasicCredentials awsCreds = AwsBasicCredentials.create(
                    this.loadTestConfig.getAwsAccessKey(),
                    this.loadTestConfig.getAwsSecretAccessKey());
            var clientBuilder = software.amazon.awssdk.services.ec2.Ec2Client.builder()
                    .region(Region.of(instanceRegion))
                    .credentialsProvider(StaticCredentialsProvider.create(awsCreds));

            // Apply endpoint override if set (for Floci testing)
            // First check static field (for programmatic override), then config
            String effectiveEndpoint = endpointOverride != null ? endpointOverride
                    : this.loadTestConfig.getEndpointOverride();
            if (effectiveEndpoint != null && !effectiveEndpoint.isBlank()) {
                clientBuilder.endpointOverride(URI.create(effectiveEndpoint));
                log.info("Using endpoint override for EC2 client: {}", effectiveEndpoint);
            }

            awsEc2Client = clientBuilder.build();
        } else {
            if (this.loadTestConfig.getWorkerUrlList().isEmpty()) {
                throw new LoadTestInitializationException(
                        "No workers or AWS credentials provided. Please provide at least one of them to run the load test");
            }
        }
    }

    private List<Instance> launchAndCleanAux(WorkerType workerType, Filter tagFilter, int numberAtBeginning) {

        List<Instance> resultList = new ArrayList<>();
        Filter runningFilter = getInstanceStateFilter(InstanceStateName.RUNNING);
        Filter stoppedFilter = getInstanceStateFilter(InstanceStateName.STOPPED);
        List<Instance> runningInstances = getInstanceWithFilters(tagFilter, runningFilter);
        List<Instance> stoppedInstances = getInstanceWithFilters(tagFilter, stoppedFilter);

        if (!runningInstances.isEmpty()) {
            resultList.addAll(runningInstances);
        }

        if (!stoppedInstances.isEmpty() && resultList.size() < numberAtBeginning) {
            List<Instance> subList = new ArrayList<>();
            if ((stoppedInstances.size() + resultList.size()) > numberAtBeginning) {
                for (int i = 0; i < numberAtBeginning; i++) {
                    subList.add(stoppedInstances.get(i));
                }
            } else {
                subList = stoppedInstances;
            }
            startInstances(getInstanceIds(subList));
            for (int i = 0; i < subList.size(); i++) {
                resultList.add(waitUntilInstanceState(subList.get(i).instanceId(), InstanceStateName.RUNNING));
            }
        }

        List<String> instanceIds = getInstanceIds(resultList);
        log.info("{} EC2 instances found ({})", resultList.size(), workerType.getValue());

        if (!instanceIds.isEmpty()) {
            // Clean launched instances
            rebootInstance(instanceIds);
            for (String id : instanceIds) {
                waitUntilInstanceState(id, InstanceStateName.RUNNING);
            }
        }

        if (resultList.size() < numberAtBeginning) {
            log.info("Launching {} instance(s)", numberAtBeginning - resultList.size());
            resultList.addAll(launchInstance(numberAtBeginning - resultList.size(), workerType));
        }
        if (!resultList.isEmpty()) {
            sleeper.sleep(WAIT_RUNNING_STATE_S, WAITING_FOR_INSTANCES_TO_BE_READY);
        }
        return resultList;
    }

    public List<Instance> launchAndCleanInitialInstances() {
        if (workersNumberAtTheBeginning == 0 && workersRampUp > 0) {
            return launchAndCleanAux(WorkerType.WORKER, getTagWorkerFilter(), workersRampUp);
        }

        return launchAndCleanAux(WorkerType.WORKER, getTagWorkerFilter(), workersNumberAtTheBeginning);
    }

    public List<Instance> launchAndCleanInitialRecordingInstances() {
        return launchAndCleanAux(WorkerType.RECORDING_WORKER, getTagRecordingFilter(),
                recordingWorkersNumberAtTheBeginning);
    }

    public List<Instance> launchInstance(int number, WorkerType workerType) {
        Filter workerTagFilter = null;
        if (workerType == WorkerType.RECORDING_WORKER) {
            workerTagFilter = getTagRecordingFilter();
        } else {
            workerTagFilter = getTagWorkerFilter();
        }
        Filter stoppedFilter = getInstanceStateFilter(InstanceStateName.STOPPED);
        List<Instance> stoppedInstances = getInstanceWithFilters(workerTagFilter, stoppedFilter);

        if (stoppedInstances.size() == number) {
            startInstances(getInstanceIds(stoppedInstances));
            return Arrays
                    .asList(waitUntilInstanceState(stoppedInstances.get(0).instanceId(), InstanceStateName.RUNNING));

        } else if (stoppedInstances.size() > number) {
            List<Instance> subList = new ArrayList<>();
            List<Instance> result = new ArrayList<>();
            for (int i = 0; i < number; i++) {
                subList.add(stoppedInstances.get(i));
            }
            startInstances(getInstanceIds(subList));
            for (Instance instance : subList) {
                result.add(waitUntilInstanceState(instance.instanceId(), InstanceStateName.RUNNING));
            }
            return result;

        } else {
            startInstances(getInstanceIds(stoppedInstances));

            List<Tag> tags = new ArrayList<>();
            if (workerType.equals(WorkerType.RECORDING_WORKER)) {
                tags.add(RECORDING_NAME_TAG);
                tags.add(RECORDING_TAG);
            } else {
                tags.add(NAME_TAG);
                tags.add(LOADTEST_WORKER_TAG);
            }
            List<Instance> result = this.launchInstance(number - stoppedInstances.size(), tags);
            result.addAll(stoppedInstances);
            return result;
        }

    }

    public List<Instance> launchRecordingInstance(int number) {

        Filter recordingFilter = getTagRecordingFilter();
        Filter stoppedFilter = getInstanceStateFilter(InstanceStateName.STOPPED);

        List<Instance> stoppedInstance = getInstanceWithFilters(recordingFilter, stoppedFilter);

        if (!stoppedInstance.isEmpty()) {
            startInstances(Arrays.asList(stoppedInstance.get(0).instanceId()));
            Instance instanceReady = waitUntilInstanceState(stoppedInstance.get(0).instanceId(),
                    InstanceStateName.RUNNING);
            return Arrays.asList(instanceReady);
        }

        List<Tag> tags = new ArrayList<>();
        tags.add(RECORDING_NAME_TAG);
        tags.add(RECORDING_TAG);

        return this.launchInstance(number, tags);
    }

    private List<Instance> launchInstance(int number, List<Tag> tags) {

        TagSpecification tagSpecification = TagSpecification.builder()
                .resourceType(ResourceType.INSTANCE)
                .tags(tags)
                .build();

        RunInstancesRequest.Builder requestBuilder = RunInstancesRequest.builder()
                .imageId(amiId)
                .instanceType(instanceType)
                .tagSpecifications(tagSpecification)
                .maxCount(number)
                .minCount(number)
                .blockDeviceMappings(
                        BlockDeviceMapping.builder()
                                .deviceName("/dev/sda1")
                                .ebs(EbsBlockDevice.builder()
                                        .volumeSize(50)
                                        .deleteOnTermination(true)
                                        .build())
                                .build());

        if (!this.loadTestConfig.getWorkerAvailabilityZone().equals("")) {
            requestBuilder.placement(
                    Placement.builder()
                            .availabilityZone(this.loadTestConfig.getWorkerAvailabilityZone())
                            .build());
        }

        if (!this.loadTestConfig.getWorkerInstanceKeyPair().isBlank()) {
            requestBuilder.keyName(this.loadTestConfig.getWorkerInstanceKeyPair());
        }

        if (!securityGroupId.isEmpty()) {
            requestBuilder.securityGroupIds(securityGroupId);
        }

        RunInstancesResponse ec2response = awsEc2Client.runInstances(requestBuilder.build());

        List<Instance> ec2InstanceList = new ArrayList<>();

        for (Instance instance : ec2response.instances()) {
            // Need to get the instance periodically to obtain all properties updated
            ec2InstanceList.add(waitUntilInstanceState(instance.instanceId(), InstanceStateName.RUNNING));
            log.info("Successfully started EC2 instance");
        }

        return ec2InstanceList;

    }

    public void stopInstance(List<Instance> instances) {

        if (!instances.isEmpty()) {
            List<String> instanceIds = getInstanceIds(instances);
            StopInstancesRequest request = StopInstancesRequest.builder()
                    .instanceIds(instanceIds)
                    .build();

            awsEc2Client.stopInstances(request);
            log.info("Instance {} is being stopped", instanceIds);

            for (String id : instanceIds) {
                waitUntilInstanceState(id, InstanceStateName.STOPPED);
            }
        }
    }

    public void rebootInstance(List<String> instanceIds) {

        RebootInstancesRequest request = RebootInstancesRequest.builder()
                .instanceIds(instanceIds)
                .build();

        awsEc2Client.rebootInstances(request);
        log.info("Instance {} is being rebooted", instanceIds);
        // Avoided start test before reboot instances
        if (!instanceIds.isEmpty()) {
            sleeper.sleep(WAIT_RUNNING_STATE_S, WAITING_FOR_INSTANCES_TO_BE_READY);
        }
    }

    public void startInstances(List<String> instanceIds) {
        if (!instanceIds.isEmpty()) {
            StartInstancesRequest request = StartInstancesRequest.builder()
                    .instanceIds(instanceIds)
                    .build();
            awsEc2Client.startInstances(request);
            log.info("Instance {} is being starting", instanceIds);
            // Avoided start test before start instances
            if (!instanceIds.isEmpty()) {
                sleeper.sleep(WAIT_RUNNING_STATE_S, WAITING_FOR_INSTANCES_TO_BE_READY);
            }
        }
    }

    public void terminateAllInstances() {
        Filter workerTagFilter = getTagWorkerFilter();
        List<Instance> instancesToTerminate = getInstanceWithFilters(workerTagFilter);
        List<String> instancesToTerminateIds = getInstanceIds(instancesToTerminate);
        terminateInstance(instancesToTerminateIds);
    }

    public void terminateInstance(List<String> instanceIds) {
        if (instanceIds == null || instanceIds.isEmpty()) {
            log.info("No instances to terminate");
            return;
        }

        TerminateInstancesRequest terminateInstancesRequest = TerminateInstancesRequest.builder()
                .instanceIds(instanceIds)
                .build();
        awsEc2Client.terminateInstances(terminateInstancesRequest);
        log.info("Instance {} is terminating", instanceIds);
    }

    private List<String> getInstanceIds(List<Instance> instances) {
        return instances.stream()
                .map(Instance::instanceId)
                .toList();
    }

    private Instance getInstanceFromId(String instanceId) {
        DescribeInstancesRequest request = DescribeInstancesRequest.builder()
                .instanceIds(instanceId)
                .build();
        try {
            DescribeInstancesResponse result = awsEc2Client.describeInstances(request);
            return result.reservations().get(0).instances().get(0);

        } catch (Exception e) {
            return getInstanceFromId(instanceId);
        }

    }

    private List<Instance> getInstanceWithFilters(Filter... filters) {

        List<Instance> resultList = new ArrayList<>();

        DescribeInstancesRequest request = DescribeInstancesRequest.builder()
                .filters(Arrays.asList(filters))
                .build();
        DescribeInstancesResponse result = awsEc2Client.describeInstances(request);

        for (Reservation r : result.reservations()) {
            resultList.addAll(r.instances());
        }

        return resultList;
    }

    private Instance waitUntilInstanceState(String instanceId, InstanceStateName finalState) {

        Instance instance = getInstanceFromId(instanceId);
        InstanceState instanceState = instance.state();
        boolean needsWait = true;

        if (instanceState.name().equals(finalState)) {
            needsWait = finalState.equals(InstanceStateName.RUNNING) && instance.publicDnsName().isBlank();
        }

        if (needsWait) {
            log.info("{} ... Waiting until instance will be {} ... ", instanceState.name(), finalState);
            sleeper.sleep(WAIT_RUNNING_STATE_S, "Waiting for instance to be ready");
            return waitUntilInstanceState(instanceId, finalState);
        }

        log.info("Instance {} is {}", instance.publicDnsName(), finalState);
        return instance;
    }

    private Filter getTagWorkerFilter() {
        return Filter.builder()
                .name("tag:" + LOADTEST_WORKER_TAG.key())
                .values(LOADTEST_WORKER_TAG.value())
                .build();
    }

    private Filter getTagRecordingFilter() {
        return Filter.builder()
                .name("tag:" + RECORDING_TAG.key())
                .values(RECORDING_TAG.value())
                .build();
    }

    private Filter getInstanceStateFilter(InstanceStateName state) {
        return Filter.builder()
                .name("instance-state-name")
                .values(state.toString())
                .build();
    }
}
