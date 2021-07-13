package io.openvidu.loadtest.services;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.amazonaws.auth.AWSStaticCredentialsProvider;
import com.amazonaws.auth.BasicAWSCredentials;
import com.amazonaws.services.ec2.AmazonEC2;
import com.amazonaws.services.ec2.AmazonEC2ClientBuilder;
import com.amazonaws.services.ec2.model.DescribeInstancesRequest;
import com.amazonaws.services.ec2.model.DescribeInstancesResult;
import com.amazonaws.services.ec2.model.Filter;
import com.amazonaws.services.ec2.model.Instance;
import com.amazonaws.services.ec2.model.InstanceState;
import com.amazonaws.services.ec2.model.InstanceStateName;
import com.amazonaws.services.ec2.model.RebootInstancesRequest;
import com.amazonaws.services.ec2.model.Reservation;
import com.amazonaws.services.ec2.model.ResourceType;
import com.amazonaws.services.ec2.model.RunInstancesRequest;
import com.amazonaws.services.ec2.model.RunInstancesResult;
import com.amazonaws.services.ec2.model.Tag;
import com.amazonaws.services.ec2.model.TagSpecification;
import com.amazonaws.services.ec2.model.TerminateInstancesRequest;

import io.openvidu.loadtest.config.LoadTestConfig;

@Service
public class Ec2Client {

	private static final Logger log = LoggerFactory.getLogger(Ec2Client.class);

	private static String AMI_ID = "";
	private static String INSTANCE_TYPE = "";
	private static String SECURITY_GROUP_ID = "";
	private static String INSTANCE_REGION = "";
	private static int WORKERS_NUMBER_AT_THE_BEGINNING;

	private static final Tag NAME_TAG = new Tag().withKey("Name").withValue("Worker");
	private static final Tag RECORDING_NAME_TAG = new Tag().withKey("Name").withValue("Recording_Worker");
	private static final Tag TYPE_TAG = new Tag().withKey("Type").withValue("OpenViduLoadTest");
	private static final Tag RECORDING_TAG = new Tag().withKey("Type").withValue("RecordingLoadTest");

	private static final int WAIT_RUNNING_STATE_MS = 5000;

	private static AmazonEC2 ec2;

	@Autowired
	private LoadTestConfig loadTestConfig;

	@PostConstruct
	public void init() {
		AMI_ID = this.loadTestConfig.getWorkerAmiId();
		INSTANCE_TYPE = this.loadTestConfig.getWorkerInstanceType();
		SECURITY_GROUP_ID = this.loadTestConfig.getWorkerSecurityGroupId();
		INSTANCE_REGION = this.loadTestConfig.getWorkerInstanceRegion();
		WORKERS_NUMBER_AT_THE_BEGINNING = this.loadTestConfig.getWorkersNumberAtTheBeginning();

		if(!this.loadTestConfig.getAwsAccessKey().isBlank() && !this.loadTestConfig.getAwsSecretAccessKey().isBlank()) {
			BasicAWSCredentials awsCreds = new BasicAWSCredentials(this.loadTestConfig.getAwsAccessKey(), this.loadTestConfig.getAwsSecretAccessKey());
			ec2 = AmazonEC2ClientBuilder.standard().withRegion(INSTANCE_REGION).withCredentials(new AWSStaticCredentialsProvider(awsCreds)).build();
		} else {
			log.error("AWS credentials are empty in application.properties");
			if(this.loadTestConfig.getWorkerUrlList().isEmpty()) {
				System.exit(0);	
			}
		}
	}

	public List<Instance> launchAndCleanInitialInstances() {
		List<Instance> resultList = new ArrayList<Instance>();
		Filter tagFilter = getTagFilter();
		Filter stateFilter = getInstanceStateFilter(InstanceStateName.Running);
		resultList.addAll(getInstanceWithFilters(tagFilter, stateFilter));
		List<String> instanceIds = getInstanceIds(resultList);
		log.info("{} EC2 instances found", resultList.size());

		if(!instanceIds.isEmpty()) {
			// Clean launched instances
			rebootInstance(instanceIds);
			for (String id : instanceIds) {
				waitUntilInstanceState(id, InstanceStateName.Running);
			}
		}

		if (resultList.size() < WORKERS_NUMBER_AT_THE_BEGINNING) {
			log.info("Launching {} instance(s)", WORKERS_NUMBER_AT_THE_BEGINNING - resultList.size());
			resultList.addAll(launchInstance(WORKERS_NUMBER_AT_THE_BEGINNING - resultList.size()));
		}

		this.sleep(WAIT_RUNNING_STATE_MS);		
		return resultList;
	}

	public List<Instance> launchInstance(int number){

		List<Tag> tags = new ArrayList<Tag>();
		tags.add(NAME_TAG);
		tags.add(TYPE_TAG);
		
		return this.launchInstance(number, tags);
	}
	
	public List<Instance> launchRecordingInstance(int number){

		List<Instance> instance = getInstanceWithFilters(getTagRecordingFilter());
		if(instance.size() > 0) {
			rebootInstance(Arrays.asList(instance.get(0).getInstanceId()));
			return instance;
		}

		List<Tag> tags = new ArrayList<Tag>();
		tags.add(RECORDING_NAME_TAG);
		tags.add(RECORDING_TAG);
		
		return this.launchInstance(number, tags);
	}
	
	private List<Instance> launchInstance(int number, List<Tag> tags){
		
		TagSpecification tagSpecification = new TagSpecification().withResourceType(ResourceType.Instance)
				.withTags(tags);

		RunInstancesRequest ec2request = new RunInstancesRequest().withImageId(AMI_ID).withInstanceType(INSTANCE_TYPE)
				.withTagSpecifications(tagSpecification).withMaxCount(number).withMinCount(1);

		if (!SECURITY_GROUP_ID.isEmpty()) {
			ec2request.withSecurityGroupIds(SECURITY_GROUP_ID);
		}

		RunInstancesResult ec2response = ec2.runInstances(ec2request);

		List<Instance> ec2InstanceList = new ArrayList<Instance>();

		for (Instance instance : ec2response.getReservation().getInstances()) {
			// Need to get the instance periodically to obtain all properties updated
			ec2InstanceList.add(waitUntilInstanceState(instance.getInstanceId(), InstanceStateName.Running));
			log.info("Successfully started EC2 instance");
		}

		return ec2InstanceList;

	}

//	public void startInstance(List<String> instanceIds) {
//		StartInstancesRequest request = new StartInstancesRequest().withInstanceIds(instanceIds);
//
//		ec2.startInstances(request);
//		for (String id : instanceIds) {
//			waitUntilInstanceState(id, InstanceStateName.Running);
//		}
//	}

//	public void stopInstance(List<String> instanceIds) {
//		StopInstancesRequest request = new StopInstancesRequest().withInstanceIds(instanceIds);
//
//		ec2.stopInstances(request);
//		log.info("Instance {} is being stopped", instanceIds);
//
//		for (String id : instanceIds) {
//			waitUntilInstanceState(id, InstanceStateName.Stopped);
//		}
//	}

	public void rebootInstance(List<String> instanceIds) {

		RebootInstancesRequest request = new RebootInstancesRequest().withInstanceIds(instanceIds);
		
		ec2.rebootInstances(request);
		log.info("Instance {} is being rebooted", instanceIds);
		// Avoided start test before reboot instances
		sleep(WAIT_RUNNING_STATE_MS);
	}

	public void terminateAllInstances() {
		Filter tagFilter = getTagFilter();
		List<Instance> instancesToTerminate = getInstanceWithFilters(tagFilter);
		List<String> instancesToTerminateIds = getInstanceIds(instancesToTerminate);
		terminateInstance(instancesToTerminateIds);
	}

	public void terminateInstance(List<String> instanceIds) {

		TerminateInstancesRequest terminateInstancesRequest = new TerminateInstancesRequest()
				.withInstanceIds(instanceIds);
		ec2.terminateInstances(terminateInstancesRequest);
		log.info("Instance {} is terminating", instanceIds);

//		for (String id : instanceIds) {
//			waitUntilInstanceState(id, InstanceStateName.Terminated);
//		}
	}

	private List<String> getInstanceIds(List<Instance> instances) {
		List<String> instanceIds = new ArrayList<String>();
		for (Instance i : instances) {
			instanceIds.add(i.getInstanceId());
		}
		return instanceIds;
	}

	private Instance getInstanceFromId(String instanceId) {
		DescribeInstancesRequest request = new DescribeInstancesRequest().withInstanceIds(instanceId);
		try {
			DescribeInstancesResult result = ec2.describeInstances(request);
			return result.getReservations().get(0).getInstances().get(0);

		} catch (Exception e) {
			return getInstanceFromId(instanceId);
		}

	}

	private List<Instance> getInstanceWithFilters(Filter... filters) {

		List<Instance> resultList = new ArrayList<Instance>();

		DescribeInstancesRequest request = new DescribeInstancesRequest().withFilters(filters);
		DescribeInstancesResult result = ec2.describeInstances(request);

		for (Reservation r : result.getReservations()) {
			resultList.addAll(r.getInstances());
		}

		return resultList;
	}

	private Instance waitUntilInstanceState(String instanceId, InstanceStateName finalState) {

		Instance instance = getInstanceFromId(instanceId);
		InstanceState instanceState = instance.getState();
		boolean needsWait = true;

		if (instanceState.getName().equals(finalState.toString())) {
			needsWait = finalState.equals(InstanceStateName.Running) && instance.getPublicDnsName().isBlank();
		}

		if (needsWait) {
			log.info("{} ... Waiting until instance will be {} ... ", instanceState.getName(), finalState);
			sleep(WAIT_RUNNING_STATE_MS);
			return waitUntilInstanceState(instanceId, finalState);
		} 
		
		log.info("Instance {} is {}", instance.getPublicDnsName(), finalState);
		return instance;
	}

	private Filter getTagFilter() {
		return new Filter().withName("tag:" + TYPE_TAG.getKey()).withValues(TYPE_TAG.getValue());
	}
	
	private Filter getTagRecordingFilter() {
		return new Filter().withName("tag:" + RECORDING_TAG.getKey()).withValues(RECORDING_TAG.getValue());
	}

	private Filter getInstanceStateFilter(InstanceStateName state) {
		return new Filter().withName("instance-state-name").withValues(state.toString());
	}
	
	private void sleep(int ms) {
		try {
			Thread.sleep(ms);
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}
}
