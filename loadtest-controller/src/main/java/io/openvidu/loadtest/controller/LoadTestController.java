package io.openvidu.loadtest.controller;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import javax.annotation.PostConstruct;

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
	private static List<String> devWorkersList = new ArrayList<String>();

	private static String currentWorkerUrl = "";
	private static int workersUsed = 0;

	private Calendar startTime;
	private static final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

	private static final int WEBSOCKET_PORT = 5001;

	private static boolean PROD_MODE = false;
	private static AtomicInteger sessionNumber = new AtomicInteger(0);
	private static AtomicInteger userNumber = new AtomicInteger(1);
	private static boolean responseIsOk = true;
	private AtomicInteger sessionsCompleted = new AtomicInteger(0);
	private AtomicInteger totalParticipants = new AtomicInteger(0);

	private static List<Integer> streamsPerWorker = new ArrayList<>();
	private static List<ResultReport> resultReportList = new ArrayList<ResultReport>();

	@PostConstruct
	public void initialize() {
		PROD_MODE = this.loadTestConfig.getWorkerUrlList().isEmpty();
		devWorkersList = this.loadTestConfig.getWorkerUrlList();

	}

	public List<ResultReport> startLoadTests(List<TestCase> testCasesList) {
		
		if(this.loadTestConfig.isTerminateWorkers()) {
			log.info("Terminate all EC2 instances");
			this.ec2Client.terminateAllInstances();
			return resultReportList;
		}
		
		
		if (PROD_MODE) {
			this.kibanaClient.importDashboards();
		}

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {
				for (int i = 0; i < testCase.getParticipants().size(); i++) {

					if (PROD_MODE) {
						// Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
						workersList.addAll(this.ec2Client.launchAndCleanInitialInstances());
					}
					
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					System.out.print("\n");
					log.info("Starting test with N:N session typology");
					log.info("The number of session that will be created are {}",
							testCase.getSessions() < 0 ? "infinite" : testCase.getSessions());
					log.info("Each session will be composed by {} USERS. All of them will be PUBLISHERS",
							participantsBySession);
					this.startTime = Calendar.getInstance();
					this.startNxNTest(participantsBySession, testCase);
					sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
					this.disconnectAllSessions();
					this.saveResultReport(testCase, String.valueOf(participantsBySession));
					this.cleanEnvironment();
				}
			} else if (testCase.is_NxM() || testCase.is_TEACHING()) {
				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					
					if (PROD_MODE) {
						// Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
						workersList.addAll(this.ec2Client.launchAndCleanInitialInstances());
					}
					String participants = testCase.getParticipants().get(i);
					int publishers = Integer.parseInt(participants.split(":")[0]);
					int subscribers = Integer.parseInt(participants.split(":")[1]);
					log.info("Starting test with N:M session typology");
					log.info("The number of session that will be created are {}", testCase.getSessions());
					log.info("Each session will be composed by {} users. {} Publisher and {} Subscribers",
							publishers + subscribers, publishers, subscribers);

					this.startTime = Calendar.getInstance();
					this.startNxMTest(publishers, subscribers, testCase);
					sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
					this.disconnectAllSessions();
					this.saveResultReport(testCase, participants);
					this.cleanEnvironment();
				}

			} else if (testCase.is_TERMINATE() && PROD_MODE) {
				log.info("TERMINATE typology. Terminate all EC2 instances");
				this.ec2Client.terminateAllInstances();
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

		while (responseIsOk && needCreateNewSession(sessionsLimit)) {

			if (responseIsOk && sessionNumber.get() > 0) {
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			int suffix =  (int) (Math.random() * (10000 - 1)) + 1;
			String sessionNumberStr = sessionNumber.get() + "-" + suffix;
			System.out.print("\n");
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumberStr);

			for (int i = 0; i < participantsBySession; i++) {
				log.info("Creating PUBLISHER '{}' in session",
						this.loadTestConfig.getUserNamePrefix() + userNumber.get());
				responseIsOk = this.browserEmulatorClient.createPublisher(currentWorkerUrl, userNumber.get(),
						sessionNumberStr, testCase);

				if (responseIsOk) {
					this.totalParticipants.incrementAndGet();
					if (loadTestConfig.isManualParticipantsAllocation() && this.browserEmulatorClient.getParticipantsInWorker() == loadTestConfig.getParticipantsPerWorker()) {
						setAndInitializeNextWorker();
					}
					if (userNumber.get() < participantsBySession) {
						sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
						userNumber.getAndIncrement();
					}
				

				} else {
					log.error("Response status is not 200 OK. Exit");
					break;
				}
			}

			if (responseIsOk) {
				log.info("Session number {} has been succesfully created ", sessionNumber.get());
				this.sessionsCompleted.incrementAndGet();
				userNumber.set(1);
				if (!loadTestConfig.isManualParticipantsAllocation() && needCreateNewSession(sessionsLimit) && !this.currentWorkerHasSpace(participantsBySession, 0)) {
					streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
					setAndInitializeNextWorker();
				}
			} else {
				streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
			}
		}
	}

	private void startNxMTest(int publishers, int subscribers, TestCase testCase) {
		int totalParticipants = subscribers + publishers;
		int sessionsLimit = testCase.getSessions();
		setAndInitializeNextWorker();
		while (responseIsOk && needCreateNewSession(sessionsLimit)) {

			if (responseIsOk && sessionNumber.get() > 0) {
				// Waiting time between sessions
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			int suffix =  (int) (Math.random() * (10000 - 1)) + 1;
			String sessionNumberStr = sessionNumber.get() + "-" + suffix;

			System.out.print("\n");
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumberStr);

			// Adding all publishers
			for (int i = 0; i < publishers; i++) {
				log.info("Creating PUBLISHER '{}' in session",
						this.loadTestConfig.getUserNamePrefix() + userNumber.get());
				responseIsOk = this.browserEmulatorClient.createPublisher(currentWorkerUrl, userNumber.get(),
						sessionNumberStr, testCase);
				if (responseIsOk) {
					userNumber.getAndIncrement();
					this.totalParticipants.incrementAndGet();
					if (loadTestConfig.isManualParticipantsAllocation() && this.browserEmulatorClient.getParticipantsInWorker() == loadTestConfig.getParticipantsPerWorker()) {
						setAndInitializeNextWorker();
					}
				} else {
					log.error("Response status is not 200 OK. Exit");
					break;
				}
			}

			if (responseIsOk) {
				// Adding all subscribers
				for (int i = 0; i < subscribers; i++) {
					log.info("Creating SUBSCRIBER '{}' in session",
							this.loadTestConfig.getUserNamePrefix() + userNumber.get());
					responseIsOk = this.browserEmulatorClient.createSubscriber(currentWorkerUrl, userNumber.get(),
							sessionNumberStr, testCase);

					if (responseIsOk) {
						this.totalParticipants.incrementAndGet();
						if (loadTestConfig.isManualParticipantsAllocation() && this.browserEmulatorClient.getParticipantsInWorker() == loadTestConfig.getParticipantsPerWorker()) {
							setAndInitializeNextWorker();
						}
						if (userNumber.get() < totalParticipants) {
							userNumber.getAndIncrement();
							sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
						}
					} else {
						log.error("Response status is not 200 OK. Exit");
						break;
					}
				}

				if (responseIsOk) {
					log.info("Session number {} has been succesfully created ", sessionNumber.get());
					userNumber.set(1);
					this.sessionsCompleted.incrementAndGet();
					// TODO: in TEACHING sessions, all participants are PUBLISHERS
					// Now, it is assuming they are PUBLISHERS and SUBSCRIBERS
					if (!loadTestConfig.isManualParticipantsAllocation() && needCreateNewSession(sessionsLimit) && !this.currentWorkerHasSpace(publishers, subscribers)) {
						streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
						setAndInitializeNextWorker();
					}
				}else {
					streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
				}
			}
		}
	}

	private void setAndInitializeNextWorker() {
		String nextWorkerUrl = getNextWorker();
		boolean requireInitialize = !currentWorkerUrl.equals(nextWorkerUrl);
		currentWorkerUrl = nextWorkerUrl;
		this.browserEmulatorClient.ping(currentWorkerUrl);
		new WebSocketClient().connect("ws://" + currentWorkerUrl + ":" + WEBSOCKET_PORT + "/events");
		if (requireInitialize && this.loadTestConfig.isKibanaEstablished()) {
			this.browserEmulatorClient.initializeInstance(currentWorkerUrl);
		}
	}

	private String getNextWorker() {
		if (PROD_MODE) {
			workersUsed++;
			String newWorkerUrl = "";
			if (currentWorkerUrl.isBlank()) {
				newWorkerUrl = workersList.get(0).getPublicDnsName();
				log.info("Getting new worker already launched: {}", newWorkerUrl);
			} else {
				int index = 0;
				Instance nextInstance;

				// Search last used instance
				for (int i = 0; i < workersList.size(); i++) {
					if (currentWorkerUrl.equals(workersList.get(i).getPublicDnsName())) {
						index = i;
						break;
					}
				}
				nextInstance = index + 1 >= workersList.size() ? null : workersList.get(index + 1);
				if (nextInstance == null) {
					log.info("Launching a new Ec2 instance... ");
					List<Instance> nextInstanceList = this.ec2Client
							.launchInstance(this.loadTestConfig.getWorkersRumpUp());
					workersList.addAll(nextInstanceList);
					newWorkerUrl = nextInstanceList.get(0).getPublicDnsName();
					log.info("New worker has been launched: {}", newWorkerUrl);

				} else {
					newWorkerUrl = nextInstance.getPublicDnsName();
					log.info("Getting new worker already launched: {}", newWorkerUrl);

				}
			}
			return newWorkerUrl;
		} else {
			workersUsed = devWorkersList.size();
			if (devWorkersList.size() > 1) {
				int index = devWorkersList.indexOf(currentWorkerUrl);
				if (index + 1 >= devWorkersList.size()) {
					return devWorkersList.get(0);
				}
				return devWorkersList.get(index + 1);
			}
			log.info("Development workers list has 1 element and cannot create a new one.");
			return devWorkersList.get(0);
		}
	}

	private boolean needCreateNewSession(int sessionsLimit) {
		return sessionsLimit == -1 || (sessionsLimit > 0 && this.sessionsCompleted.get() < sessionsLimit);
//		return sessionsLimit == -1 || (sessionsLimit > 0 && sessionNumber.get() < sessionsLimit);

	}

	private boolean currentWorkerHasSpace(int publishers, int subscribers) {
		int streamsSent = publishers;
		int streamsReceived = publishers * (publishers - 1) + subscribers * publishers;
		int streamsForNextSessions = streamsSent + streamsReceived;
		double cpuPerStream = this.browserEmulatorClient.getWorkerCpuPct()
				/ this.browserEmulatorClient.getStreamsInWorker();
		double cpuIncrementForNextSession = streamsForNextSessions * cpuPerStream;

		return this.browserEmulatorClient.getWorkerCpuPct() + cpuIncrementForNextSession <= this.loadTestConfig
				.getWorkerMaxLoad();
	}

	private void cleanEnvironment() {
		
		this.totalParticipants.set(0);
		this.sessionsCompleted.set(0);
		sessionNumber.set(0);
		userNumber.set(1);
		responseIsOk = true;
		workersUsed = 0;
		currentWorkerUrl = "";
		streamsPerWorker = new ArrayList<>();
		sleep(loadTestConfig.getSecondsToWaitBetweenTestCases(), "time cleaning environment");
	}
	
	private void disconnectAllSessions() {
		List<String> workersUrl = devWorkersList;

		if (PROD_MODE) {
			// Add all ec2 instances
			for (Instance ec2 : workersList) {
				workersUrl.add(ec2.getPublicDnsName());
			}
			workersList = new ArrayList<Instance>();
		}
		this.browserEmulatorClient.disconnectAll(workersUrl);
		
	}

	private void saveResultReport(TestCase testCase, String participantsBySession) {
		Calendar endTime = Calendar.getInstance();
		endTime.add(Calendar.SECOND, loadTestConfig.getSecondsToWaitBetweenTestCases());
		
		// Parse date to match with Kibana time filter
		String startTimeStr = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTimeStr = formatter.format(endTime.getTime()).replace(" ", "T");
		String kibanaUrl = this.kibanaClient.getDashboardUrl(startTimeStr, endTimeStr);

		ResultReport rr = new ResultReport().setTotalParticipants(this.totalParticipants.get())
				.setNumSessionsCompleted(this.sessionsCompleted.get())
				.setNumSessionsCreated(sessionNumber.get())
				.setWorkersUsed(workersUsed)
				.setStreamsPerWorker(streamsPerWorker)
				.setSessionTypology(testCase.getTopology().toString())
				.setBrowserModeSelected(testCase.getBrowserMode().toString())
				.setOpenviduRecording(testCase.getOpenviduRecordingMode().toString())
				.setBrowserRecording(testCase.isBrowserRecording())
				.setParticipantsPerSession(participantsBySession)
				.setStopReason(this.browserEmulatorClient.getStopReason())
				.setStartTime(this.startTime)
				.setEndTime(endTime)
				.setKibanaUrl(kibanaUrl)
				.setManualParticipantAllocation(loadTestConfig.isManualParticipantsAllocation())
				.setParticipantsPerWorker(loadTestConfig.getParticipantsPerWorker())
				.build();

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
