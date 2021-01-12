package io.openvidu.loadtest.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.utils.CustomHttpClient;

/**
 * @author Carlos Santos
 *
 */

public class LoadTestController {
	
	private static final Logger log = LoggerFactory.getLogger(LoadTestController.class);
	private static List<TestCase> testCasesList;
	private CustomHttpClient httpClient;
	
	private static int SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS = 1;
	private static int SECONDS_TO_WAIT_BETWEEN_SESSIONS = 1;
	
	public LoadTestController(List<TestCase> testCasesList) {
		this.httpClient = new CustomHttpClient(); 
		LoadTestController.testCasesList = testCasesList;
		
	}
	
	public void startLoadTests() {
		
		testCasesList.forEach(testCase -> {
			
			if(testCase.is_NxN()) {
				this.startNxNTest(testCase.getParticipants());
			}
			else if(testCase.is_1xN()) {
				this.start1xNTest(testCase.getParticipants());
			} 
			else if(testCase.is_NxM()) {
				this.startNxMTest(testCase.getParticipants());
			}
			else if(testCase.is_TEACHING()) {
				this.startTeachingTest(testCase.getParticipants());
			}
			else {
				log.error("Test case has wrong typology, SKIPPED.");
				return;
			}
			
//			this.getAllMetrics();
//			this.restartOpenVidu();
//			this.restartCluster();
		});
		
	}

	private void startNxNTest(List<String> participants) {
		// TODO Auto-generated method stub
		
	}

	private void start1xNTest(List<String> participants) {
		// TODO Auto-generated method stub
		
	}

	private void startNxMTest(List<String> participants) {
		// TODO Auto-generated method stub
		
	}

	private void startTeachingTest(List<String> participants) {
		// TODO Auto-generated method stub
		
	}



}
