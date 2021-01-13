package io.openvidu.loadtest.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.openvidu.loadtest.infrastructure.BrowserEmulatorClient;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.Typology;

/**
 * @author Carlos Santos
 *
 */

public class LoadTestController {
	
	private static final Logger log = LoggerFactory.getLogger(LoadTestController.class);
	private static List<TestCase> testCasesList;
	private BrowserEmulatorClient browserEmulatorClient;
	
	private static String SESSION_NAME_PREFIX = "LoadTestSession";
	private static String USER_NAME_PREFIX = "User";
	private static int SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS = 4;
	private static int SECONDS_TO_WAIT_BETWEEN_SESSIONS = 2;
	
	public LoadTestController(List<TestCase> testCasesList) {
		this.browserEmulatorClient = new BrowserEmulatorClient(); 
		LoadTestController.testCasesList = testCasesList;
		
	}
	
	public void startLoadTests() {
		
		testCasesList.forEach(testCase -> {
			
			if(testCase.is_NxN()) {
					
					for(int i = 0; i < testCase.getParticipants().size(); i++) {
						int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
						System.out.println(participantsBySession);
						this.startNxNTest(participantsBySession);

						this.getInfoAndClean();
					}
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
			
		});
		
	}

	private void startNxNTest(int participantsBySession) {
		int sessionNumber = 0;
		
//		while(true) {
		participantsBySession = 1;
			for(int i = 0; i < participantsBySession; i++) {
//				this.browserEmulatorClient.createPublisher(USER_NAME_PREFIX + i, SESSION_NAME_PREFIX + sessionNumber, true, true);
				
				this.browserEmulatorClient.getCapacity(Typology.NxN.getValue(), participantsBySession);
				try {
					Thread.sleep(SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS * 1000);
				} catch (InterruptedException e) {
					// TODO Auto-generated catch block
					e.printStackTrace();
				}
			}
				sessionNumber++;

				try {
					Thread.sleep(SECONDS_TO_WAIT_BETWEEN_SESSIONS * 1000);
				} catch (InterruptedException e) {
					// TODO Auto-generated catch block
					e.printStackTrace();
				}

//		}
			
		
			
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
	
	private void getInfoAndClean() {
//		this.getAllMetrics();
//		this.restartOpenVidu();
//		this.restartCluster();

	}



}
