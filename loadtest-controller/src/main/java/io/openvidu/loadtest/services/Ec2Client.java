package io.openvidu.loadtest.services;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
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
import io.openvidu.loadtest.models.testcase.WorkerType;

@Service
public class Ec2Client {

    private static final Logger log = LoggerFactory.getLogger(Ec2Client.class);

    private static String AMI_ID = "";
    private static String INSTANCE_TYPE = "";
    private static String SECURITY_GROUP_ID = "";
    private static String INSTANCE_REGION = "";
    private static int WORKERS_NUMBER_AT_THE_BEGINNING;
    private static int RECORDING_WORKERS_NUMBER_AT_THE_BEGINNING;
    private static int WORKERS_RAMP_UP;

    private static final Tag NAME_TAG = Tag.builder().key("Name").value("Worker").build();
    private static final Tag RECORDING_NAME_TAG = Tag.builder().key("Name").value("Recording Worker").build();
    private static final Tag LOADTEST_WORKER_TAG = Tag.builder().key("Type").value("OpenViduLoadTest").build();
    private static final Tag RECORDING_TAG = Tag.builder().key("Type").value("RecordingLoadTest").build();

    private static final int WAIT_RUNNING_STATE_S = 5;

    private static software.amazon.awssdk.services.ec2.Ec2Client awsEc2Client;

    @Autowired
    private LoadTestConfig loadTestConfig;

    @Autowired
    private Sleeper sleeper;

    @PostConstruct
    public void init() {
        AMI_ID = this.loadTestConfig.getWorkerAmiId();
        INSTANCE_TYPE = this.loadTestConfig.getWorkerInstanceType();
        SECURITY_GROUP_ID = this.loadTestConfig.getWorkerSecurityGroupId();
        INSTANCE_REGION = this.loadTestConfig.getWorkerInstanceRegion();
        WORKERS_NUMBER_AT_THE_BEGINNING = this.loadTestConfig.getWorkersNumberAtTheBeginning();
        RECORDING_WORKERS_NUMBER_AT_THE_BEGINNING = this.loadTestConfig.getRecordingWorkersNumberAtTheBeginning();
        WORKERS_RAMP_UP = this.loadTestConfig.getWorkersRumpUp();

        if (!this.loadTestConfig.getAwsAccessKey().isBlank()
                && !this.loadTestConfig.getAwsSecretAccessKey().isBlank()) {
            AwsBasicCredentials awsCreds = AwsBasicCredentials.create(
                    this.loadTestConfig.getAwsAccessKey(),
                    this.loadTestConfig.getAwsSecretAccessKey());
            awsEc2Client = software.amazon.awssdk.services.ec2.Ec2Client.builder()
                    .region(Region.of(INSTANCE_REGION))
                    .credentialsProvider(StaticCredentialsProvider.create(awsCreds))
                    .build();
        } else {
            log.error("AWS credentials are empty in application.properties");
            if (this.loadTestConfig.getWorkerUrlList().isEmpty()) {
                System.exit(0);
            }
        }
    }

    private List<Instance> launchAndCleanAux(WorkerType workerType, Filter tagFilter, int numberAtBeginning) {

        List<Instance> resultList = new ArrayList<Instance>();
        Filter runningFilter = getInstanceStateFilter(InstanceStateName.RUNNING);
        Filter stoppedFilter = getInstanceStateFilter(InstanceStateName.STOPPED);
        List<Instance> runningInstances = getInstanceWithFilters(tagFilter, runningFilter);
        List<Instance> stoppedInstances = getInstanceWithFilters(tagFilter, stoppedFilter);

        if (runningInstances.size() > 0) {
            resultList.addAll(runningInstances);
        }

        if (stoppedInstances.size() > 0 && resultList.size() < numberAtBeginning) {
            List<Instance> subList = new ArrayList<Instance>();
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
        sleeper.sleep(WAIT_RUNNING_STATE_S, "Waiting for instances to be ready");
        return resultList;
    }

    public List<Instance> launchAndCleanInitialInstances() {
        if (WORKERS_NUMBER_AT_THE_BEGINNING == 0) {
            if (WORKERS_RAMP_UP > 0) {
                return launchAndCleanAux(WorkerType.WORKER, getTagWorkerFilter(), WORKERS_RAMP_UP);
            }
        }
        return launchAndCleanAux(WorkerType.WORKER, getTagWorkerFilter(), WORKERS_NUMBER_AT_THE_BEGINNING);
    }

    public List<Instance> launchAndCleanInitialRecordingInstances() {
        return launchAndCleanAux(WorkerType.RECORDING_WORKER, getTagRecordingFilter(),
                RECORDING_WORKERS_NUMBER_AT_THE_BEGINNING);
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
            List<Instance> subList = new ArrayList<Instance>();
            List<Instance> result = new ArrayList<Instance>();
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

            List<Tag> tags = new ArrayList<Tag>();
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
        // Filter runningFilter = getInstanceStateFilter(InstanceStateName.RUNNING);
        Filter stoppedFilter = getInstanceStateFilter(InstanceStateName.STOPPED);

        // List<Instance> runningInstance = getInstanceWithFilters(recordingFilter,
        // runningFilter);
        List<Instance> stoppedInstance = getInstanceWithFilters(recordingFilter, stoppedFilter);

        // if(runningInstance.size() > 0) {
        // rebootInstance(Arrays.asList(runningInstance.get(0).getInstanceId()));
        // this.sleep(WAIT_RUNNING_STATE_S);
        // return runningInstance;
        // }

        if (stoppedInstance.size() > 0) {
            startInstances(Arrays.asList(stoppedInstance.get(0).instanceId()));
            Instance instanceReady = waitUntilInstanceState(stoppedInstance.get(0).instanceId(),
                    InstanceStateName.RUNNING);
            return Arrays.asList(instanceReady);
        }

        List<Tag> tags = new ArrayList<Tag>();
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
                .imageId(AMI_ID)
                .instanceType(INSTANCE_TYPE)
                .tagSpecifications(tagSpecification)
                .maxCount(number)
                .minCount(1)
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

        if (!SECURITY_GROUP_ID.isEmpty()) {
            requestBuilder.securityGroupIds(SECURITY_GROUP_ID);
        }

        RunInstancesResponse ec2response = awsEc2Client.runInstances(requestBuilder.build());

        List<Instance> ec2InstanceList = new ArrayList<Instance>();

        for (Instance instance : ec2response.instances()) {
            // Need to get the instance periodically to obtain all properties updated
            ec2InstanceList.add(waitUntilInstanceState(instance.instanceId(), InstanceStateName.RUNNING));
            log.info("Successfully started EC2 instance");
        }

        return ec2InstanceList;

    }

    // public void startInstance(List<String> instanceIds) {
    // StartInstancesRequest request = new
    // StartInstancesRequest().withInstanceIds(instanceIds);
    //
    // ec2.startInstances(request);
    // for (String id : instanceIds) {
    // waitUntilInstanceState(id, InstanceStateName.Running);
    // }
    // }

    public void stopInstance(List<Instance> instances) {

        if (instances.size() > 0) {
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
        sleeper.sleep(WAIT_RUNNING_STATE_S, "Waiting for instances to be ready");
    }

    public void startInstances(List<String> instanceIds) {
        if (instanceIds.size() > 0) {
            StartInstancesRequest request = StartInstancesRequest.builder()
                    .instanceIds(instanceIds)
                    .build();
            awsEc2Client.startInstances(request);
            log.info("Instance {} is being starting", instanceIds);
            // Avoided start test before start instances
            sleeper.sleep(WAIT_RUNNING_STATE_S, "Waiting for instances to be ready");
        }
    }

    public void terminateAllInstances() {
        Filter workerTagFilter = getTagWorkerFilter();
        List<Instance> instancesToTerminate = getInstanceWithFilters(workerTagFilter);
        List<String> instancesToTerminateIds = getInstanceIds(instancesToTerminate);
        terminateInstance(instancesToTerminateIds);
    }

    public void terminateInstance(List<String> instanceIds) {

        TerminateInstancesRequest terminateInstancesRequest = TerminateInstancesRequest.builder()
                .instanceIds(instanceIds)
                .build();
        awsEc2Client.terminateInstances(terminateInstancesRequest);
        log.info("Instance {} is terminating", instanceIds);

        // for (String id : instanceIds) {
        // waitUntilInstanceState(id, InstanceStateName.TERMINATED);
        // }
    }

    private List<String> getInstanceIds(List<Instance> instances) {
        return instances.stream()
                .map(Instance::instanceId)
                .collect(Collectors.toList());
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

        List<Instance> resultList = new ArrayList<Instance>();

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
