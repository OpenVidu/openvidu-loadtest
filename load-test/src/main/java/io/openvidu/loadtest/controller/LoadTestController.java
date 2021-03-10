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

	@Autowired
	private BrowserEmulatorClient browserEmulatorClient;

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private KibanaClient kibanaClient;

	private Calendar startTime;
	private static final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
	private static final int ONE_MINUTE = 1;

	private static AtomicInteger sessionNumber = new AtomicInteger(0);
	private static AtomicInteger userNumber = new AtomicInteger(1);
	private static boolean responseIsOk = true;

	public void startLoadTests(List<TestCase> testCasesList) {
		this.kibanaClient.importDashboards();
		
		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {
				this.initCalendarTime();
				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					System.out.print("\n");
					log.info("Starting test with N:N session typology");
					log.info("The number of session that will be created are {}",
							testCase.getSessions() < 0 ? "infinite" : testCase.getSessions());
					log.info("Each session will be composed by {} USERS. All of them will be PUBLISHERS",
							participantsBySession);

					this.startNxNTest(participantsBySession, testCase.getSessions());
					sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time after test finished");
					this.cleanEnvironment();
					this.showLoadTestReport();

				}
			} else if (testCase.is_NxM() || testCase.is_TEACHING()) {
				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					String participants = testCase.getParticipants().get(i);
					int publishers = Integer.parseInt(participants.split(":")[0]);
					int subscribers = Integer.parseInt(participants.split(":")[1]);
					log.info("Starting test with N:M session typology");
					log.info("The number of session that will be created are {}", testCase.getSessions());
					log.info("Each session will be composed by {} users. {} Publisher and {} Subscribers",
							publishers + subscribers, publishers, subscribers);

					this.startNxMTest(publishers, subscribers, testCase.getSessions(), testCase.is_TEACHING());
					sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time after test finished");
					this.cleanEnvironment();
					this.showLoadTestReport();
				}

			} else {
				log.error("Test case has wrong typology, SKIPPED.");
				return;
			}

		});

	}

	private void startNxNTest(int participantsBySession, int sessionsLimit) {

		while (responseIsOk && canCreateNewSession(sessionsLimit, sessionNumber)) {

			if (responseIsOk && sessionNumber.get() > 0) {
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			System.out.print("\n");
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.get());

			for (int i = 0; i < participantsBySession; i++) {
				log.info("Creating PUBLISHER '{}' in session",
						this.loadTestConfig.getUserNamePrefix() + userNumber.get());
				responseIsOk = this.browserEmulatorClient.createPublisher(userNumber.get(), sessionNumber.get());

				if (responseIsOk && userNumber.get() < participantsBySession) {
					sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
					userNumber.getAndIncrement();
				} else if (!responseIsOk) {
					log.error("Response status is not 200 OK. Exit");
					return;
				}
			}

			if (responseIsOk) {
				log.info("Session number {} has been succesfully created ", sessionNumber.get());
//				this.showIterationReport(sessionNumber.get(), userNumber.get(), participantsBySession);
				userNumber.set(1);
			}
		}
	}

	private void startNxMTest(int publishers, int subscribers, int sessionsLimit, boolean isTeaching) {
		int totalParticipants = subscribers + publishers;

		while (responseIsOk && canCreateNewSession(sessionsLimit, sessionNumber)) {

			if (responseIsOk && sessionNumber.get() > 0) {
				// Waiting time between sessions
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			System.out.print("\n");
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.get());

			// Adding all publishers
			for (int i = 0; i < publishers; i++) {
				log.info("Creating PUBLISHER '{}' in session",
						this.loadTestConfig.getUserNamePrefix() + userNumber.get());
				responseIsOk = this.browserEmulatorClient.createPublisher(userNumber.get(), sessionNumber.get());
				if (!responseIsOk) {
					log.error("Response status is not 200 OK. Exit");
					return;
				}
				userNumber.getAndIncrement();
			}

			if (responseIsOk) {
				// Adding all subscribers
				for (int i = 0; i < subscribers; i++) {
					log.info("Creating SUBSCRIBER '{}' in session",
							this.loadTestConfig.getUserNamePrefix() + userNumber.get());
					responseIsOk = this.browserEmulatorClient.createSubscriber(userNumber.get(), sessionNumber.get(),
							isTeaching);

					if (responseIsOk && userNumber.get() < totalParticipants) {
						sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
						userNumber.getAndIncrement();
					} else if (!responseIsOk) {
						log.error("Response status is not 200 OK. Exit");
						return;
					}
				}

				if (responseIsOk) {
					log.info("Session number {} has been succesfully created ", sessionNumber.get());
//					this.showIterationReport(sessionNumber.get(), userNumber.get(), totalParticipants);
					userNumber.set(1);
				}
			}
		}
	}

	private boolean canCreateNewSession(int sessionsLimit, AtomicInteger sessionNumber) {
		return sessionsLimit == -1 || (sessionsLimit > 0 && sessionNumber.get() < sessionsLimit);

	}

	private void cleanEnvironment() {
		this.browserEmulatorClient.disconnectAll();
		sessionNumber.set(0);
		sleep(loadTestConfig.getSecondsToWaitBetweenTestCases(), "time cleaning environment");
	}
	
	private void initCalendarTime() {
		this.startTime = Calendar.getInstance();
		// Subtract five minutes because of Kibana time filter
		this.startTime.add(Calendar.MINUTE, -ONE_MINUTE);
	}

	private void showLoadTestReport() {

		Calendar endCalendarTime = Calendar.getInstance();
		endCalendarTime.add(Calendar.MINUTE, ONE_MINUTE);

		// Parse date to match with Kibana time filter
		String startTime = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTime = formatter.format(endCalendarTime.getTime()).replace(" ", "T");

		String url = this.kibanaClient.getDashboardUrl(startTime, endTime);
		log.info("Load Test finished.");
		log.info("Kibana Dashboard Report: {} ", url);

	}

//	private void showIterationReport(int sessionsCreated, int currentUserNumber, int participantsBySession) {
//		int sessionsCompleted = 0;
//		if (sessionsCreated > 1) {
//			sessionsCompleted = sessionsCreated - 1;
//		}
//
//		int totalPublishers = (participantsBySession * sessionsCompleted) + currentUserNumber;
//		int totalSubscribers = (participantsBySession * (participantsBySession - 1) * sessionsCompleted)
//				+ currentUserNumber * (currentUserNumber - 1);
//
//		log.info("---  Report  ---");
//		log.info("Total sessions created: {}", sessionsCreated);
//		log.info("Total publishers created: {}", totalPublishers);
//		log.info("Total subscribers created: {}", totalSubscribers);
//		log.info("-- ----------------- ---");
//	}

	private void sleep(int seconds, String reason) {
		if (seconds > 0) {
			try {
				log.info("Waiting {} seconds because of {}", seconds, reason);
				Thread.sleep(seconds * 1000);
			} catch (InterruptedException e) {
				e.printStackTrace();
			}
		}

	}

}
