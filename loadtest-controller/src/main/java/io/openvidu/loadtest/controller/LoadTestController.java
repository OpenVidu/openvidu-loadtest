package io.openvidu.loadtest.controller;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import javax.annotation.PostConstruct;

import org.apache.commons.math.stat.regression.SimpleRegression;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import com.amazonaws.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WebSocketClient;
import io.openvidu.loadtest.utils.DataIO;

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
	private ElasticSearchClient esClient;

	@Autowired
	private Ec2Client ec2Client;

	@Autowired
	private DataIO io;

	private static List<Instance> awsWorkersList = new ArrayList<Instance>();
	private static List<String> devWorkersList = new ArrayList<String>();
	private static List<Instance> recordingWorkersList = new ArrayList<Instance>();
	private static List<WebSocketClient> wsSessions = new ArrayList<WebSocketClient>();

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

	private static SimpleRegression regression = new SimpleRegression();

	@PostConstruct
	public void initialize() {
		PROD_MODE = this.loadTestConfig.getWorkerUrlList().isEmpty();
		devWorkersList = this.loadTestConfig.getWorkerUrlList();
	}

	public void startLoadTests(List<TestCase> testCasesList) {

		if (this.loadTestConfig.isTerminateWorkers()) {
			log.info("Terminate all EC2 instances");
			this.ec2Client.terminateAllInstances();
			return;
		}

		if (PROD_MODE) {
			this.kibanaClient.importDashboards();
		}

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {
				for (int i = 0; i < testCase.getParticipants().size(); i++) {

					if (PROD_MODE) {
						// Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
						awsWorkersList.addAll(this.ec2Client.launchAndCleanInitialInstances());
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
						awsWorkersList.addAll(this.ec2Client.launchAndCleanInitialInstances());
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
			}
		});
	}

	private void startNxNTest(int participantsBySession, TestCase testCase) {
		int testCaseSessionsLimit = testCase.getSessions();

		setAndInitializeNextWorker();

		while (responseIsOk && needCreateNewSession(testCaseSessionsLimit)) {

			if (responseIsOk && sessionNumber.get() > 0) {
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			System.out.print("\n");
//			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumberStr);

			for (int i = 0; i < participantsBySession; i++) {
				log.info("Creating PUBLISHER '{}' in session",
						this.loadTestConfig.getUserNamePrefix() + userNumber.get());

				if (needRecordingParticipant()) {
					responseIsOk = this.launchRecordingParticipant(testCase, Integer.toString(participantsBySession));
				} else {
					responseIsOk = this.browserEmulatorClient.createPublisher(currentWorkerUrl, userNumber.get(),
							sessionNumber.get(), testCase);
					this.inititalizeNewWorkerIfNecessary(testCase, OpenViduRole.PUBLISHER);
				}

				if (responseIsOk) {
					this.totalParticipants.incrementAndGet();
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
			} else {
				streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
			}
		}
	}

	private void startNxMTest(int publishers, int subscribers, TestCase testCase) {
		int totalParticipants = subscribers + publishers;
		int testCaseSessionsLimit = testCase.getSessions();
		setAndInitializeNextWorker();
		while (responseIsOk && needCreateNewSession(testCaseSessionsLimit)) {

			if (sessionNumber.get() > 0) {
				// Waiting time between sessions
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			System.out.print("\n");
//			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumberStr);

			// Adding all publishers
			for (int i = 0; i < publishers; i++) {
				log.info("Creating PUBLISHER '{}' in session", loadTestConfig.getUserNamePrefix() + userNumber.get());
				if (needRecordingParticipant()) {
					responseIsOk = this.launchRecordingParticipant(testCase, publishers + "_" + subscribers);
				} else {
					responseIsOk = this.browserEmulatorClient.createPublisher(currentWorkerUrl, userNumber.get(),
							sessionNumber.get(), testCase);
					OpenViduRole nextRoleToAdd = i == publishers - 1 ? OpenViduRole.SUBSCRIBER : OpenViduRole.PUBLISHER;
					this.inititalizeNewWorkerIfNecessary(testCase, nextRoleToAdd);
				}
				if (responseIsOk) {
					userNumber.getAndIncrement();
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

					if (needRecordingParticipant()) {
						responseIsOk = this.launchRecordingParticipant(testCase, publishers + "_" + subscribers);

					} else {
						responseIsOk = this.browserEmulatorClient.createSubscriber(currentWorkerUrl, userNumber.get(),
								sessionNumber.get(), testCase);
						OpenViduRole nextRoleToAdd = testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : OpenViduRole.SUBSCRIBER;
						this.inititalizeNewWorkerIfNecessary(testCase, nextRoleToAdd);
					}

					if (responseIsOk) {
						this.totalParticipants.incrementAndGet();
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
				} else {
					streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
				}
			}
		}
	}

	private void inititalizeNewWorkerIfNecessary(TestCase testCase, OpenViduRole nextRoleToAdd) {
		if (loadTestConfig.isManualParticipantsAllocation()) {
			boolean areSessionsPerWorkerReached = sessionNumber.get() == loadTestConfig.getSessionsPerWorker();
			if (areSessionsPerWorkerReached && loadTestConfig.getWorkersRumpUp() > 0) {
				log.warn("Sessions in worker: {} is equals than limit: {}", sessionNumber.get(),
						loadTestConfig.getSessionsPerWorker());
				setAndInitializeNextWorker();
			}
		} else {
			if (!willBeWorkerMaxLoadReached(nextRoleToAdd)
					&& loadTestConfig.getWorkersRumpUp() > 0) {
				log.warn("Worker has not space enough for new participants.");
				log.info("Worker CPU {} will be bigger than the limit: {}",
						this.browserEmulatorClient.getWorkerCpuPct(), this.loadTestConfig.getWorkerMaxLoad());
				streamsPerWorker.add(this.browserEmulatorClient.getStreamsInWorker());
				setAndInitializeNextWorker();
			}
		}
	}

	private void setAndInitializeNextWorker() {
		String nextWorkerUrl = getNextWorker();
		this.initializeInstance(nextWorkerUrl);
		currentWorkerUrl = nextWorkerUrl;
	}

	private void initializeInstance(String url) {
		boolean requireInitialize = !currentWorkerUrl.equals(url);
		this.browserEmulatorClient.ping(url);
		WebSocketClient ws = new WebSocketClient();
		ws.connect("ws://" + url + ":" + WEBSOCKET_PORT + "/events");
		wsSessions.add(ws);
		if (requireInitialize && this.loadTestConfig.isKibanaEstablished()) {
			this.browserEmulatorClient.initializeInstance(url);
		}
	}

	private String getNextWorker() {
		if (PROD_MODE) {
			workersUsed++;
			String newWorkerUrl = "";
			if (currentWorkerUrl.isBlank()) {
				newWorkerUrl = awsWorkersList.get(0).getPublicDnsName();
				log.info("Getting new worker already launched: {}", newWorkerUrl);
			} else {
				int index = 0;
				Instance nextInstance;

				// Search last used instance
				for (int i = 0; i < awsWorkersList.size(); i++) {
					if (currentWorkerUrl.equals(awsWorkersList.get(i).getPublicDnsName())) {
						index = i;
						break;
					}
				}
				nextInstance = index + 1 >= awsWorkersList.size() ? null : awsWorkersList.get(index + 1);
				if (nextInstance == null) {
					log.info("Launching a new Ec2 instance... ");
					List<Instance> nextInstanceList = this.ec2Client
							.launchInstance(this.loadTestConfig.getWorkersRumpUp());
					awsWorkersList.addAll(nextInstanceList);
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
	}

	private boolean needRecordingParticipant() {
		double medianodeLoadForRecording = this.loadTestConfig.getMedianodeLoadForRecording();
		int recordingSessionGroup = this.loadTestConfig.getRecordingSessionGroup();

		boolean isLoadRecordingEnabled = medianodeLoadForRecording > 0
				&& !this.browserEmulatorClient.isRecordingParticipantCreated(sessionNumber.get())
				&& this.esClient.getMediaNodeCpu() >= medianodeLoadForRecording;

		boolean isRecordingSessionGroupEnabled = recordingSessionGroup > 0
				&& !this.browserEmulatorClient.isRecordingParticipantCreated(sessionNumber.get());

		return isLoadRecordingEnabled || isRecordingSessionGroupEnabled;
	}
	
	private boolean launchRecordingParticipant(TestCase testCase, String participants) {
		log.info("Starting REAL BROWSER for quality control");
		String uri = "";
		
		if (PROD_MODE) {
			log.info("Starting recording EC2 instance...");
			List<Instance> newRecordingInstanceList = this.ec2Client.launchRecordingInstance(1);
			recordingWorkersList.addAll(newRecordingInstanceList);
			initializeInstance(newRecordingInstanceList.get(0).getPublicDnsName());
			uri = newRecordingInstanceList.get(0).getPublicDnsName();
		} else {
			uri = devWorkersList.get(0);
		}
		String recordingMetadata = testCase.getBrowserMode().getValue() + "_N-N_" + participants + "PSes";
		return this.browserEmulatorClient.createExternalRecordingPublisher(uri, userNumber.get(),
				sessionNumber.get(), testCase, recordingMetadata);
	}

	private boolean willBeWorkerMaxLoadReached(OpenViduRole nextRoleToAdd) {
		int publishers = this.browserEmulatorClient.getRoleInWorker(currentWorkerUrl, OpenViduRole.PUBLISHER);
		int subscribers = this.browserEmulatorClient.getRoleInWorker(currentWorkerUrl, OpenViduRole.SUBSCRIBER);
		if (nextRoleToAdd.equals(OpenViduRole.PUBLISHER)) {
			publishers++;
		} else {
			subscribers++;
		}
		int streamsSent = publishers;
		int streamsReceived = publishers * (publishers - 1) + subscribers * publishers;
		int streamsForNextParticipant = streamsSent + streamsReceived;

		double streams = this.browserEmulatorClient.getStreamsInWorker();
		double cpu = this.browserEmulatorClient.getWorkerCpuPct();
		log.debug("Adding data to regression: streams: {}, cpu: {}", streams, cpu);
		regression.addData(streams, cpu);
		if (cpu >= this.loadTestConfig.getWorkerMaxLoad()) {
			log.info("Worker max load reached: {}", cpu);
			return true;
		} 
		double prediction = regression.predict(streamsForNextParticipant);
		if (prediction != prediction) {
			// Simple heuristic used for first 2 cases, after that we have enough data for simple regression
			double cpuPerStream = this.browserEmulatorClient.getWorkerCpuPct()
					/ this.browserEmulatorClient.getStreamsInWorker();
			double cpuForNextParticipant = streamsForNextParticipant * cpuPerStream;
			log.info("Using heuristic prediction");
			log.info("Predicting for {} streams, using {}% cpu per stream", streamsForNextParticipant, cpuPerStream);
			log.info("Current CPU: {}%", cpu);
			log.info("CPU estimated cost for next session (heuristic): {}%", cpuForNextParticipant);
			return cpuForNextParticipant <= this.loadTestConfig.getWorkerMaxLoad();
		} else {
			log.info("Using regression prediction");
			log.info("Predicting for {} streams", streamsForNextParticipant);
			log.info("Current CPU: {}%", cpu);
			log.info("CPU estimated cost for next session (regression): {}%", prediction);
			return prediction <= this.loadTestConfig.getWorkerMaxLoad();
		}
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
		waitToMediaServerLiveAgain();
	}

	private void waitToMediaServerLiveAgain() {
		while (this.esClient.getMediaNodeCpu() > 5.00) {
			this.sleep(5, "Waiting MediaServer recovers his CPU");
		}
	}

	private void disconnectAllSessions() {
		List<String> workersUrl = devWorkersList;
		for (WebSocketClient ws : wsSessions) {
			ws.close();
		}
		wsSessions.clear();
		if (PROD_MODE) {
			// Add all ec2 instances
			for (Instance ec2 : awsWorkersList) {
				workersUrl.add(ec2.getPublicDnsName());
			}
			for (Instance recordingEc2 : recordingWorkersList) {
				workersUrl.add(recordingEc2.getPublicDnsName());
			}
			this.browserEmulatorClient.disconnectAll(workersUrl);
			this.ec2Client.stopInstance(recordingWorkersList);
			this.ec2Client.stopInstance(awsWorkersList);
			awsWorkersList = new ArrayList<Instance>();
			recordingWorkersList = new ArrayList<Instance>();

		} else {
			this.browserEmulatorClient.disconnectAll(workersUrl);
		}
	}

	private void saveResultReport(TestCase testCase, String participantsBySession) {
		Calendar endTime = Calendar.getInstance();
		endTime.add(Calendar.SECOND, loadTestConfig.getSecondsToWaitBetweenTestCases());
		endTime.add(Calendar.SECOND, 10);

		// Parse date to match with Kibana time filter
		String startTimeStr = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTimeStr = formatter.format(endTime.getTime()).replace(" ", "T");
		String kibanaUrl = this.kibanaClient.getDashboardUrl(startTimeStr, endTimeStr);

		ResultReport rr = new ResultReport().setTotalParticipants(this.totalParticipants.get())
				.setNumSessionsCompleted(this.sessionsCompleted.get()).setNumSessionsCreated(sessionNumber.get())
				.setWorkersUsed(workersUsed).setStreamsPerWorker(streamsPerWorker)
				.setSessionTypology(testCase.getTypology().toString())
				.setBrowserModeSelected(testCase.getBrowserMode().toString())
				.setOpenviduRecording(testCase.getOpenviduRecordingMode().toString())
				.setBrowserRecording(testCase.isBrowserRecording()).setParticipantsPerSession(participantsBySession)
				.setStopReason(this.browserEmulatorClient.getStopReason()).setStartTime(this.startTime)
				.setEndTime(endTime).setKibanaUrl(kibanaUrl)
				.setManualParticipantAllocation(loadTestConfig.isManualParticipantsAllocation())
				.setSessionsPerWorker(loadTestConfig.getSessionsPerWorker())
				.setS3BucketName(
						"https://s3.console.aws.amazon.com/s3/buckets/" + loadTestConfig.getS3BucketName())
				.setLastResponses(this.browserEmulatorClient.getLastResponsesArray()).build();

		this.io.exportResults(rr);

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
