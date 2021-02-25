package io.openvidu.loadtest.controller;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.infrastructure.BrowserEmulatorClient;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.monitoring.KibanaClient;

/**
 * @author Carlos Santos
 *
 */

@Controller
public class LoadTestController {

	private static final Logger log = LoggerFactory.getLogger(LoadTestController.class);
//	private static final int HTTP_STATUS_OK = 200;

	@Autowired
	private BrowserEmulatorClient browserEmulatorClient;

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private KibanaClient kibanaClient;

//	@Autowired
//	private JsonUtils jsonUtils;

	private Calendar startTime;
	private static final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
	private static final int FIVE_MINUTES = 5;

	public void startLoadTests(List<TestCase> testCasesList) {
		this.kibanaClient.importDashboards();
		this.startTime = Calendar.getInstance();
		// Subtract five minutes because of Kibana time filter
		this.startTime.add(Calendar.MINUTE, -FIVE_MINUTES);

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {

				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					log.info("Starting test with N:N session typology");
					log.info("Each session will be composed by {} USERS. All of them will be Publishers",
							participantsBySession);
					log.info("The number of session that will be created are {}", testCase.getSessions());

					this.startNxNTest(participantsBySession, testCase.getSessions());
				}
			} else if (testCase.is_1xN()) {
				this.start1xNTest(testCase.getParticipants());
			} else if (testCase.is_NxM()) {
				this.startNxMTest(testCase.getParticipants());
			} else if (testCase.is_TEACHING()) {
				this.startTeachingTest(testCase.getParticipants());
			} else {
				log.error("Test case has wrong typology, SKIPPED.");
				return;
			}
			
			sleep(loadTestConfig.getSecondsToWaitAfterTestFinished(), "time after test finished");
			this.cleanEnvironment();

		});

		this.showLoadTestReport();

	}

	private void startNxNTest(int participantsBySession, int sessionsLimit) {
		AtomicInteger sessionNumber = new AtomicInteger(0);
		AtomicInteger userNumber = new AtomicInteger(1);
		boolean responseIsOk = true;

		while (responseIsOk && canCreateNewSession(sessionsLimit, sessionNumber)) {
			
			if(responseIsOk && sessionNumber.get() > 0) {
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}
			
			sessionNumber.getAndIncrement();
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.get());
			
			for (int i = 0; i < participantsBySession; i++) {
				
				responseIsOk = this.browserEmulatorClient.createPublisher(userNumber.get(), sessionNumber.get());
				log.info("Participant number {} added in Session number {}", userNumber.get(), sessionNumber.get());
				this.showIterationReport(sessionNumber.get(), userNumber.get(), participantsBySession);
				
				
				if (responseIsOk && userNumber.get() < participantsBySession) {
					sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
					userNumber.getAndIncrement();
				} else if (!responseIsOk) {
					log.error("Response status is not 200 OK. Exit");
					return;
				}
			}
			userNumber.set(1);
			log.info("Session number {} has been succesfully created ", sessionNumber.get());
			
		}
	}

	private void start1xNTest(int participantsBySession, int sessionsLimit) {
	}

	private void startNxMTest(List<String> participants) {

	}

	private void startTeachingTest(List<String> participants) {

	}


	private boolean canCreateNewSession(int sessionsLimit, AtomicInteger sessionNumber) {
		return sessionsLimit == -1 || (sessionsLimit > 0 && sessionNumber.get() < sessionsLimit);

	}

	public void cleanEnvironment() {
		this.browserEmulatorClient.disconnectAll();
	}

	private void showLoadTestReport() {

		Calendar endCalendarTime = Calendar.getInstance();
		endCalendarTime.add(Calendar.MINUTE, FIVE_MINUTES);

		// Parse date to match with Kibana time filter
		String startTime = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTime = formatter.format(endCalendarTime.getTime()).replace(" ", "T");

		String url = this.kibanaClient.getDashboardUrl(startTime, endTime);
		log.info("Load Test finished.");
		log.info("Kibana Dashboard Report: {} ", url);

	}

	private void showIterationReport(int sessionsCreated, int currentUserNumber, int participantsBySession) {
		int sessionsCompleted = 0;
		if (sessionsCreated > 1) {
			sessionsCompleted = sessionsCreated - 1;
		}

		int totalPublishers = (participantsBySession * sessionsCompleted) + currentUserNumber;
		int totalSubscribers = (participantsBySession * (participantsBySession - 1) * sessionsCompleted)
				+ currentUserNumber * (currentUserNumber - 1);

		log.info("-- Iteration report ---");
		log.info("Total sessions created: {}", sessionsCreated);
		log.info("Total publishers created: {}", totalPublishers);
		log.info("Total subscribers created: {}", totalSubscribers);
		log.info("-- ----------------- ---");
	}

	private void sleep(int seconds, String reason) {
		try {
			log.info("Waiting {} seconds because of {}", seconds, reason);
			Thread.sleep(seconds * 1000);
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}

}
