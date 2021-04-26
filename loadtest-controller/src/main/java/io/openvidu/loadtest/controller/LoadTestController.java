package io.openvidu.loadtest.controller;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import com.amazonaws.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WebSocketClient;

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

	@Autowired
	private Ec2Client ec2Client;

	private static List<Instance> workersList = new ArrayList<Instance>();
	private static String currentWorkerUrl = "";
	private static int workersUsed = 0;

	private Calendar startTime;
	private static final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

	private static AtomicInteger sessionNumber = new AtomicInteger(0);
	private static AtomicInteger userNumber = new AtomicInteger(1);
	private static boolean responseIsOk = true;
	private AtomicInteger sessionsCompleted = new AtomicInteger(0);
	private AtomicInteger totalParticipants = new AtomicInteger(0);

	private static List<ResultReport> resultReportList = new ArrayList<ResultReport>();

	public List<ResultReport> startLoadTests(List<TestCase> testCasesList) {
		this.kibanaClient.importDashboards();

		// Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
		workersList.addAll(this.ec2Client.launchAndCleanInitialInstances());

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {
				this.startTime = Calendar.getInstance();
				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					System.out.print("\n");
					log.info("Starting test with N:N session typology");
					log.info("The number of session that will be created are {}",
							testCase.getSessions() < 0 ? "infinite" : testCase.getSessions());
					log.info("Each session will be composed by {} USERS. All of them will be PUBLISHERS",
							participantsBySession);

					this.startNxNTest(participantsBySession, testCase);
					sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time after test finished");
					this.saveResultReport(testCase, String.valueOf(participantsBySession));
					this.cleanEnvironment();
				}
			} else if (testCase.is_NxM() || testCase.is_TEACHING()) {
				this.startTime = Calendar.getInstance();

				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					String participants = testCase.getParticipants().get(i);
					int publishers = Integer.parseInt(participants.split(":")[0]);
					int subscribers = Integer.parseInt(participants.split(":")[1]);
					log.info("Starting test with N:M session typology");
					log.info("The number of session that will be created are {}", testCase.getSessions());
					log.info("Each session will be composed by {} users. {} Publisher and {} Subscribers",
							publishers + subscribers, publishers, subscribers);

					this.startNxMTest(publishers, subscribers, testCase);
					sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time after test finished");
					this.saveResultReport(testCase, participants);
					this.cleanEnvironment();
				}

			} else {
				log.error("Test case has wrong typology, SKIPPED.");
				return;
			}
		});

		return resultReportList;

	}

	private void startNxNTest(int participantsBySession, TestCase testCase) {
		int sessionsLimit = testCase.getSessions();

		setAndInitializeNextWorker();
		
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
				responseIsOk = this.browserEmulatorClient.createPublisher(currentWorkerUrl, userNumber.get(),
						sessionNumber.get(), testCase);

				if (responseIsOk) {
					this.totalParticipants.incrementAndGet();
					if (userNumber.get() < participantsBySession) {
						sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
						userNumber.getAndIncrement();
					}
					if(this.browserEmulatorClient.getWorkerCpuPct() > this.loadTestConfig.getWorkerMaxLoad()) {
						setAndInitializeNextWorker();
					}

				} else {
					log.error("Response status is not 200 OK. Exit");
					return;
				}
			}

			if (responseIsOk) {
				log.info("Session number {} has been succesfully created ", sessionNumber.get());
				this.sessionsCompleted.incrementAndGet();
				userNumber.set(1);
			}
		}
	}

	private void startNxMTest(int publishers, int subscribers, TestCase testCase) {
		int totalParticipants = subscribers + publishers;
		int sessionsLimit = testCase.getSessions();
		setAndInitializeNextWorker();
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
				responseIsOk = this.browserEmulatorClient.createPublisher(currentWorkerUrl, userNumber.get(),
						sessionNumber.get(), testCase);
				if (responseIsOk) {
					userNumber.getAndIncrement();
					this.totalParticipants.incrementAndGet();
					if(this.browserEmulatorClient.getWorkerCpuPct() > this.loadTestConfig.getWorkerMaxLoad()) {
						setAndInitializeNextWorker();
					}
				} else {
					log.error("Response status is not 200 OK. Exit");
					return;
				}
			}

			if (responseIsOk) {
				// Adding all subscribers
				for (int i = 0; i < subscribers; i++) {
					log.info("Creating SUBSCRIBER '{}' in session",
							this.loadTestConfig.getUserNamePrefix() + userNumber.get());
					responseIsOk = this.browserEmulatorClient.createSubscriber(currentWorkerUrl, userNumber.get(),
							sessionNumber.get(), testCase);

					if (responseIsOk) {
						this.totalParticipants.incrementAndGet();
						if (userNumber.get() < totalParticipants) {
							userNumber.getAndIncrement();
							sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
						}
						if(this.browserEmulatorClient.getWorkerCpuPct() > this.loadTestConfig.getWorkerMaxLoad()) {
							setAndInitializeNextWorker();
						}

					} else {
						log.error("Response status is not 200 OK. Exit");
						return;
					}
				}

				if (responseIsOk) {
					log.info("Session number {} has been succesfully created ", sessionNumber.get());
					userNumber.set(1);
					this.sessionsCompleted.incrementAndGet();
				}
			}
		}
	}
	
	private void setAndInitializeNextWorker() {
		currentWorkerUrl = getNextWorker();
		this.browserEmulatorClient.ping(currentWorkerUrl);
		new WebSocketConfig().connect("ws://" + currentWorkerUrl + "/events");
		this.browserEmulatorClient.initializeInstance(currentWorkerUrl);
	}

	private String getNextWorker() {
		workersUsed++;
		if (currentWorkerUrl.isEmpty()) {
			log.info("Getting worker already launched");
			return workersList.get(0).getPublicDnsName();
		}

		int index = 0;
		Instance nextInstance;

		// Search last used instance
		for (int i = 0; i < workersList.size(); i++) {
			if (currentWorkerUrl.equals(workersList.get(i).getPublicDnsName())) {
				index = i;
				break;
			}
		}

		nextInstance = workersList.get(index + 1);

		if (nextInstance == null) {
			log.info("Getting a new worker. Launching a new Ec2 instance... ");
			List<Instance> nextInstanceList = this.ec2Client.launchInstance(this.loadTestConfig.getWorkersRumpUp());
			workersList.addAll(nextInstanceList);
			return nextInstanceList.get(0).getPublicDnsName();
		}
		
		log.info("Getting worker already launched");
		return nextInstance.getPublicDnsName();

	}

	private boolean canCreateNewSession(int sessionsLimit, AtomicInteger sessionNumber) {
		return sessionsLimit == -1 || (sessionsLimit > 0 && sessionNumber.get() < sessionsLimit);

	}

	private void cleanEnvironment() {
		List<String> workersUrl = new ArrayList<String>();
		for(Instance ec2 : workersList) {
			workersUrl.add(ec2.getPublicDnsName());
		}
		this.browserEmulatorClient.disconnectAll(workersUrl);
//		this.browserEmulatorClient.restartAll();
		this.ec2Client.rebootInstance(workersUrl);
		this.totalParticipants.set(0);
		this.sessionsCompleted.set(0);
		sessionNumber.set(0);
		userNumber.set(1);
		responseIsOk = true;
		workersUsed = 0;
		currentWorkerUrl = "";
		sleep(loadTestConfig.getSecondsToWaitBetweenTestCases(), "time cleaning environment");
	}

	private void saveResultReport(TestCase testCase, String participantsBySession) {
		Calendar endTime = Calendar.getInstance();

		// Parse date to match with Kibana time filter
		String startTimeStr = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTimeStr = formatter.format(endTime.getTime()).replace(" ", "T");

		int totalParticipants = this.totalParticipants.get();
		int numSessionsCompleted = this.sessionsCompleted.get();
		int numSessionsCreated = sessionNumber.get();
		String sessionTypology = testCase.getTopology().toString();
		String browserModeSelected = testCase.getBrowserMode().toString();
		boolean recording = testCase.isRecording();
		String participantsPerSession = participantsBySession;

		String kibanaUrl = this.kibanaClient.getDashboardUrl(startTimeStr, endTimeStr);

		ResultReport rr = new ResultReport(totalParticipants, numSessionsCompleted, numSessionsCreated, workersUsed,
				sessionTypology, browserModeSelected, recording, participantsPerSession, this.startTime, endTime,
				kibanaUrl);

		resultReportList.add(rr);

	}

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
