package io.openvidu.loadtest.infrastructure;

import java.util.List;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.amazonaws.services.ec2.AmazonEC2;
import com.amazonaws.services.ec2.AmazonEC2ClientBuilder;
import com.amazonaws.services.ec2.model.DescribeInstancesRequest;
import com.amazonaws.services.ec2.model.DescribeInstancesResult;
import com.amazonaws.services.ec2.model.Instance;
import com.amazonaws.services.ec2.model.InstanceState;
import com.amazonaws.services.ec2.model.InstanceStateName;
import com.amazonaws.services.ec2.model.RebootInstancesRequest;
import com.amazonaws.services.ec2.model.RebootInstancesResult;
import com.amazonaws.services.ec2.model.ResourceType;
import com.amazonaws.services.ec2.model.RunInstancesRequest;
import com.amazonaws.services.ec2.model.RunInstancesResult;
import com.amazonaws.services.ec2.model.StartInstancesRequest;
import com.amazonaws.services.ec2.model.StopInstancesRequest;
import com.amazonaws.services.ec2.model.StopInstancesResult;
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

	private static int WAIT_RUNNING_STATE_MS = 5000;

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

		ec2 = AmazonEC2ClientBuilder.standard().withRegion(INSTANCE_REGION).build();
	}

	public List<Instance> launchInstance(String name) {

		Tag nameTag = new Tag().withKey("Name").withValue(name);
		Tag typeTag = new Tag().withKey("Type").withValue("OpenViduLoadTest");

		TagSpecification tagSpecification = new TagSpecification().withResourceType(ResourceType.Instance)
				.withTags(nameTag, typeTag);

		RunInstancesRequest ec2request = new RunInstancesRequest().withImageId(AMI_ID).withInstanceType(INSTANCE_TYPE)
				.withTagSpecifications(tagSpecification).withMaxCount(WORKERS_NUMBER_AT_THE_BEGINNING).withMinCount(1);

		if (!SECURITY_GROUP_ID.isEmpty()) {
			ec2request.withSecurityGroupIds(SECURITY_GROUP_ID);
		}

		RunInstancesResult ec2response = ec2.runInstances(ec2request);

		List<Instance> ec2InstanceList = ec2response.getReservation().getInstances();

		for (Instance instance : ec2InstanceList) {
			waitUntilInstanceState(instance.getInstanceId(), InstanceStateName.Running);
			log.info("Successfully started EC2 instance {} ", instance.getPublicDnsName());

		}

		return ec2InstanceList;

	}

	public void startInstance(List<String> instanceIds) {
		StartInstancesRequest request = new StartInstancesRequest().withInstanceIds(instanceIds);

		ec2.startInstances(request);
		for (String id : instanceIds) {
			waitUntilInstanceState(id, InstanceStateName.Running);

		}

	}

	public void stopInstance(List<String> instanceIds) {
		StopInstancesRequest request = new StopInstancesRequest().withInstanceIds(instanceIds);

		StopInstancesResult result = ec2.stopInstances(request);
		log.info("Instance {} is being stopped", instanceIds);

		for (String id : instanceIds) {
			waitUntilInstanceState(id, InstanceStateName.Stopped);
		}

	}

	public void rebootInstance(List<String> instanceIds) {

		RebootInstancesRequest request = new RebootInstancesRequest().withInstanceIds(instanceIds);

		RebootInstancesResult response = ec2.rebootInstances(request);
		log.info("Instance {} is being rebooted", instanceIds);

	}

	public void terminateInstance(List<String> instanceIds) {

		TerminateInstancesRequest terminateInstancesRequest = new TerminateInstancesRequest()
				.withInstanceIds(instanceIds);
		ec2.terminateInstances(terminateInstancesRequest);
		log.info("Instance {} is terminating", instanceIds);

//		waitUntilInstanceState(instanceId,InstanceStateName.Terminated);

	}

	private Instance getInstanceFromId(String instanceId) {
		DescribeInstancesRequest request = new DescribeInstancesRequest().withInstanceIds(instanceId);
		DescribeInstancesResult result = ec2.describeInstances(request);

		return result.getReservations().get(0).getInstances().get(0);
	}

	private void waitUntilInstanceState(String instanceId, InstanceStateName finalState) {

		Instance instance = getInstanceFromId(instanceId);
		InstanceState instanceState = instance.getState();

		if (instanceState.getName().equalsIgnoreCase(finalState.toString())) {
			log.info("Instance {} is {}", instanceId, finalState);
		} else {
			try {
				log.info("{} ... Waiting until instance will be {} ... ", instanceState.getName(), finalState);
				Thread.sleep(WAIT_RUNNING_STATE_MS);
				waitUntilInstanceState(instanceId, finalState);
			} catch (InterruptedException e) {
				e.printStackTrace();
				log.error(e.getMessage());
			}
		}
	}

}
