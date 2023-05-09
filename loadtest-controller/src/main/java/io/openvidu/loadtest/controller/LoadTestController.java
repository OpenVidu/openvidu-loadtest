package io.openvidu.loadtest.controller;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;

import com.amazonaws.services.ec2.model.Instance;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.ResultReport;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.monitoring.ElasticSearchClient;
import io.openvidu.loadtest.monitoring.KibanaClient;
import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Ec2Client;
import io.openvidu.loadtest.services.WebSocketClient;
import io.openvidu.loadtest.services.WebSocketConnectionFactory;
import io.openvidu.loadtest.utils.DataIO;

/**
 * @author Carlos Santos
 *
 */

@Controller
public class LoadTestController {

	private static final Logger log = LoggerFactory.getLogger(LoadTestController.class);

	private static BrowserEmulatorClient browserEmulatorClient;
	private static LoadTestConfig loadTestConfig;
	private static KibanaClient kibanaClient;
	private static ElasticSearchClient esClient;
	private static Ec2Client ec2Client;

	private static DataIO io;

	private static List<Instance> awsWorkersList = new ArrayList<Instance>();
	private static List<String> devWorkersList = new ArrayList<String>();
	private static List<Instance> recordingWorkersList = new ArrayList<Instance>();
	private static List<WebSocketClient> wsSessions = new ArrayList<WebSocketClient>();

	private static List<Date> workerStartTimes = new ArrayList<>();
	private static List<Date> recordingWorkerStartTimes = new ArrayList<>();
	private static List<Long> workerTimes = new ArrayList<>();
	private static List<Long> recordingWorkerTimes = new ArrayList<>();

	private static int workersUsed = 0;

	private Calendar startTime;
	private static final SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");

	private static final int WEBSOCKET_PORT = 5001;

	private static boolean PROD_MODE = false;
	private static AtomicInteger sessionNumber = new AtomicInteger(0);
	private static AtomicInteger userNumber = new AtomicInteger(1);
	private static AtomicInteger sessionsCompleted = new AtomicInteger(0);
	private static AtomicInteger totalParticipants = new AtomicInteger(0);

	private static int browserEstimation = -1;

	private static List<Integer> streamsPerWorker = new ArrayList<>();
	private static Map<Calendar, List<String>> userStartTimes = new ConcurrentHashMap<>();

	private static WebSocketConnectionFactory webSocketConnectionFactory;

	public LoadTestController(BrowserEmulatorClient browserEmulatorClient, LoadTestConfig loadTestConfig,
			KibanaClient kibanaClient, ElasticSearchClient esClient, Ec2Client ec2Client, WebSocketConnectionFactory webSocketConnectionFactory,
			DataIO dataIO) {
		LoadTestController.browserEmulatorClient = browserEmulatorClient;
		LoadTestController.loadTestConfig = loadTestConfig;
		LoadTestController.kibanaClient = kibanaClient;
		LoadTestController.esClient = esClient;
		LoadTestController.ec2Client = ec2Client;
		LoadTestController.webSocketConnectionFactory = webSocketConnectionFactory;
		LoadTestController.io = dataIO;

		PROD_MODE = loadTestConfig.getWorkerUrlList().isEmpty();
		devWorkersList = loadTestConfig.getWorkerUrlList();
	}

	private static String setAndInitializeNextWorker(String currentWorker, WorkerType workerType) {
		String nextWorkerUrl = getNextWorker(currentWorker, workerType);
		return nextWorkerUrl;
	}

	private static void initializeInstance(String url) {
		browserEmulatorClient.ping(url);
		WebSocketClient ws = webSocketConnectionFactory.createConnection("ws://" + url + ":" + WEBSOCKET_PORT + "/events");
		wsSessions.add(ws);
		if (loadTestConfig.isKibanaEstablished()) {
			browserEmulatorClient.initializeInstance(url);
		}
	}

	private static String getNextWorker(String actualCurrentWorkerUrl, WorkerType workerType) {
		if (PROD_MODE) {
			workersUsed++;
			String newWorkerUrl = "";
			List<Instance> actualWorkerList = null;
			List<Date> actualWorkerStartTimes = null;
			String workerTypeValue = workerType.getValue();
			if (workerType.equals(WorkerType.RECORDING_WORKER)) {
				actualWorkerList = recordingWorkersList;
				actualWorkerStartTimes = recordingWorkerStartTimes;
			} else {
				actualWorkerList = awsWorkersList;
				actualWorkerStartTimes = workerStartTimes;
			}
			if (actualCurrentWorkerUrl.isBlank()) {
				newWorkerUrl = actualWorkerList.get(0).getPublicDnsName();
				log.info("Getting new {} already launched: {}", workerTypeValue, newWorkerUrl);
			} else {
				int index = 0;
				Instance nextInstance;

				// Search last used instance
				for (int i = 0; i < actualWorkerList.size(); i++) {
					if (actualCurrentWorkerUrl.equals(actualWorkerList.get(i).getPublicDnsName())) {
						index = i;
						break;
					}
				}
				nextInstance = index + 1 >= actualWorkerList.size() ? null : actualWorkerList.get(index + 1);
				if (nextInstance == null) {
					log.info("Launching a new Ec2 instance... ");
					List<Instance> nextInstanceList = ec2Client
							.launchInstance(loadTestConfig.getWorkersRumpUp(), workerType);
					List<Future<?>> futures = new ArrayList<>();
					ExecutorService executorService = Executors
								.newFixedThreadPool(nextInstanceList.size());
					nextInstanceList.forEach(instance -> {
						futures.add(executorService.submit(new Runnable() {
							@Override
							public void run() {
								initializeInstance(instance.getPublicDnsName());
							}
						}));
					});
					actualWorkerList.addAll(nextInstanceList);
					actualWorkerStartTimes
							.addAll(nextInstanceList.stream().map(i -> new Date()).collect(Collectors.toList()));
					newWorkerUrl = nextInstanceList.get(0).getPublicDnsName();
					futures.forEach(future -> {
						try {
							future.get();
						} catch (InterruptedException | ExecutionException e) {
							log.error("Error while initializing instance", e);
						}
					});
					log.info("New {} has been launched: {}", workerTypeValue, newWorkerUrl);

				} else {
					newWorkerUrl = nextInstance.getPublicDnsName();
					log.info("Getting new {} already launched: {}", workerTypeValue, newWorkerUrl);
				}
			}
			return newWorkerUrl;
		} else {
			workersUsed = devWorkersList.size();
			if (devWorkersList.size() > 1) {
				int index = devWorkersList.indexOf(actualCurrentWorkerUrl);
				if (index + 1 >= devWorkersList.size()) {
					return devWorkersList.get(0);
				}
				return devWorkersList.get(index + 1);
			}
			log.info("Development workers list has 1 element and cannot create a new one.");
			return devWorkersList.get(0);
		}
	}

	private static class ParticipantTask implements Callable<CreateParticipantResponse> {
		private String worker;
		private int user;
		private int session;
		private TestCase testCase;
		private boolean recording;
		private String recordingMetadata;
		private OpenViduRole role;

		public ParticipantTask(String worker, int user, int session, TestCase testCase, OpenViduRole role,
				boolean recording, String recordingMetadata) {
			this.worker = worker;
			this.session = session;
			this.user = user;
			this.testCase = testCase;
			this.role = role;
			this.recording = recording;
			this.recordingMetadata = recordingMetadata;
		}

		@Override
		public CreateParticipantResponse call() throws Exception {
			CreateParticipantResponse response;
			if (recording) {
				if (role.equals(OpenViduRole.PUBLISHER)) {
					response = browserEmulatorClient.createExternalRecordingPublisher(worker, user, session, testCase,
							recordingMetadata);
				} else {
					response = browserEmulatorClient.createExternalRecordingSubscriber(worker, user, session, testCase,
							recordingMetadata);
				}
			} else {
				if (role.equals(OpenViduRole.PUBLISHER)) {
					response = browserEmulatorClient.createPublisher(worker, user, session, testCase);
				} else {
					response = browserEmulatorClient.createSubscriber(worker, user, session, testCase);
				}
			}
			if (response.isResponseOk()) {
				Calendar startTime = Calendar.getInstance();
				totalParticipants.incrementAndGet();
				List<String> sessionUserList = new ArrayList<>(2);
				sessionUserList.add(response.getSessionId());
				sessionUserList.add(response.getUserId());
				userStartTimes.put(startTime, sessionUserList);
			} else {
				log.error("Response status is not 200 OK. Exit");
			}
			return response;
		}

	}

	private boolean estimate(boolean instancesInitialized, String workerUrl, TestCase testCase, int publishers, int subscribers) {
		log.info("Starting browser estimation");
		if (!instancesInitialized) {
			initializeInstance(workerUrl);
		}
		boolean overloaded = false;
		int iteration = 0;
		while (!overloaded) {
			// TODO: take into account recording workers
			for (int i = 0; i < publishers; i++) {
				CreateParticipantResponse response = browserEmulatorClient.createPublisher(workerUrl, iteration + i, 0,
						testCase);
				if (response.isResponseOk()) {
					double cpu = response.getWorkerCpuPct();
					if (cpu > loadTestConfig.getWorkerMaxLoad()) {
						overloaded = true;
						browserEstimation = iteration * (publishers + subscribers) + i + 1;
						log.info("Browser estimation: {} browsers per worker.", browserEstimation);
						break;
					}
				} else {
					log.error("Response status is not 200 OK. Exiting");
					return false;
				}
				sleep(5, "sleep between participants in estimation");
			}
			if (!overloaded) {
				for (int i = 0; i < subscribers; i++) {
					CreateParticipantResponse response = browserEmulatorClient.createSubscriber(
							workerUrl,
							iteration + publishers + i, 0,
							testCase);
					if (response.isResponseOk()) {
						double cpu = response.getWorkerCpuPct();
						if (cpu >= loadTestConfig.getWorkerMaxLoad()) {
							overloaded = true;
							browserEstimation = iteration * (publishers + subscribers) + publishers + i + 1;
							log.info("Browser estimation: {} browsers per worker.", browserEstimation);
							break;
						}
					} else {
						log.error("Response status is not 200 OK. Exiting");
						return false;
					}
					sleep(5, "sleep between participants in estimation");
				}
			}
			iteration++;
		}
		browserEmulatorClient.disconnectAll(List.of(workerUrl));
		return true;
	}

	public void startLoadTests(List<TestCase> testCasesList) {

		if (loadTestConfig.isTerminateWorkers()) {
			log.info("Terminate all EC2 instances");
			ec2Client.terminateAllInstances();
			return;
		}

		if (PROD_MODE) {
			kibanaClient.importDashboards();
		}

		testCasesList.forEach(testCase -> {

			if (testCase.is_NxN()) {
				for (int i = 0; i < testCase.getParticipants().size(); i++) {
					boolean instancesInitialized = false;
					if (PROD_MODE) {
						// Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
						awsWorkersList.addAll(ec2Client.launchAndCleanInitialInstances());
						recordingWorkersList.addAll(ec2Client.launchAndCleanInitialRecordingInstances());
						ExecutorService executorService = Executors
								.newFixedThreadPool(Math.max(awsWorkersList.size(), recordingWorkersList.size()));
						List<Future<?>> futures = new ArrayList<>();
						awsWorkersList.forEach(instance -> {
							futures.add(executorService.submit(new Runnable() {
								@Override
								public void run() {
									initializeInstance(instance.getPublicDnsName());
								}
							}));
						});
						recordingWorkersList.forEach(instance -> {
							futures.add(executorService.submit(new Runnable() {
								@Override
								public void run() {
									initializeInstance(instance.getPublicDnsName());
								}
							}));
						});
						workerStartTimes.addAll(awsWorkersList.stream().map(inst -> new Date())
								.collect(Collectors.toList()));
						recordingWorkerStartTimes.addAll(awsWorkersList.stream().map(inst -> new Date())
								.collect(Collectors.toList()));
						futures.forEach(future -> {
							try {
								future.get();
							} catch (InterruptedException | ExecutionException e) {
								log.error("Error while initializing instance", e);
							}
						});
						instancesInitialized = true;
						//sleep(1, "Wait for instances to be cold");
					}
					int participantsBySession = Integer.parseInt(testCase.getParticipants().get(i));
					boolean noEstimateError = true;
					if (loadTestConfig.isManualParticipantsAllocation()) {
						browserEstimation = loadTestConfig.getSessionsPerWorker();
					} else {
						noEstimateError = estimate(instancesInitialized,
								PROD_MODE ? awsWorkersList.get(0).getPublicDnsName() : devWorkersList.get(0),
								testCase, participantsBySession, 0);
					}
					if (noEstimateError) {
						log.info("Starting test with N:N session typology");
						log.info("The number of session that will be created are {}",
								testCase.getSessions() < 0 ? "infinite" : testCase.getSessions());
						log.info("Each session will be composed by {} USERS. All of them will be PUBLISHERS",
								participantsBySession);
						this.startTime = Calendar.getInstance();
						CreateParticipantResponse lastCPR = this.startNxNTest(participantsBySession, testCase);
						sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
						this.saveResultReport(testCase, String.valueOf(participantsBySession), lastCPR);
					}
					this.disconnectAllSessions();
					this.cleanEnvironment();
				}
			} else if (testCase.is_NxM() || testCase.is_TEACHING()) {
				
				boolean instancesInitialized = false;
				for (int i = 0; i < testCase.getParticipants().size(); i++) {

					if (PROD_MODE) {
						// Launching EC2 Instances defined in WORKERS_NUMBER_AT_THE_BEGINNING
						awsWorkersList.addAll(ec2Client.launchAndCleanInitialInstances());
						recordingWorkersList.addAll(ec2Client.launchAndCleanInitialRecordingInstances());
						ExecutorService executorService = Executors
								.newFixedThreadPool(Math.max(awsWorkersList.size(), recordingWorkersList.size()));
						List<Future<?>> futures = new ArrayList<>();
						awsWorkersList.forEach(instance -> {
							futures.add(executorService.submit(new Runnable() {
								@Override
								public void run() {
									initializeInstance(instance.getPublicDnsName());
								}
							}));
						});
						recordingWorkersList.forEach(instance -> {
							futures.add(executorService.submit(new Runnable() {
								@Override
								public void run() {
									initializeInstance(instance.getPublicDnsName());
								}
							}));
						});
						workerStartTimes.addAll(awsWorkersList.stream().map(inst -> new Date())
								.collect(Collectors.toList()));
						recordingWorkerStartTimes.addAll(awsWorkersList.stream().map(inst -> new Date())
								.collect(Collectors.toList()));
						futures.forEach(future -> {
							try {
								future.get();
							} catch (InterruptedException | ExecutionException e) {
								log.error("Error while initializing instance", e);
							}
						});
						instancesInitialized = true;
					}
					String participants = testCase.getParticipants().get(i);
					int publishers = Integer.parseInt(participants.split(":")[0]);
					int subscribers = Integer.parseInt(participants.split(":")[1]);
					boolean noEstimateError = true;
					if (loadTestConfig.isManualParticipantsAllocation()) {
						browserEstimation = loadTestConfig.getSessionsPerWorker();
					} else {
						noEstimateError = estimate(instancesInitialized,
								PROD_MODE ? awsWorkersList.get(0).getPublicDnsName() : devWorkersList.get(0),
								testCase, publishers, subscribers);
					}
					if (noEstimateError) {
						log.info("Starting test with N:M session typology");
						log.info("The number of session that will be created are {}", testCase.getSessions());
						log.info("Each session will be composed by {} users. {} Publisher and {} Subscribers",
								publishers + subscribers, publishers, subscribers);

						this.startTime = Calendar.getInstance();
						CreateParticipantResponse lastCPR = this.startNxMTest(publishers, subscribers, testCase);
						sleep(loadTestConfig.getSecondsToWaitBeforeTestFinished(), "time before test finished");
						this.saveResultReport(testCase, participants, lastCPR);
					}
					this.disconnectAllSessions();
					this.cleanEnvironment();
				}

			} else if (testCase.is_TERMINATE() && PROD_MODE) {
				log.info("TERMINATE typology. Terminate all EC2 instances");
				ec2Client.terminateAllInstances();
			} else {
				log.error("Test case has wrong typology, SKIPPED.");
			}
		});
	}

	public CreateParticipantResponse startNxNTest(int participantsBySession, TestCase testCase) {
		int testCaseSessionsLimit = testCase.getSessions();

		String worker = setAndInitializeNextWorker("", WorkerType.WORKER);
		String recWorker = "";

		int maxRequestsInFlight = loadTestConfig.getMaxRequests();
		ExecutorService executorService = Executors.newFixedThreadPool(maxRequestsInFlight);
		int browsersInWorker = 0;
		int tasksInProgress = 0;

		CreateParticipantResponse lastResponse = null;
		List<Future<CreateParticipantResponse>> futureList = new ArrayList<>(maxRequestsInFlight);
		while (needCreateNewSession(testCaseSessionsLimit)) {

			if (sessionNumber.get() > 0) {
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() + sessionNumber.toString());
			boolean isLastSession = sessionNumber.get() == testCaseSessionsLimit;
			for (int i = 0; i < participantsBySession; i++) {
				if ((browsersInWorker >= browserEstimation) && (loadTestConfig.getWorkersRumpUp() > 0)) {
					log.info("Browsers in worker: {} is equal than limit: {}",
							browsersInWorker, browserEstimation);
					worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
					browsersInWorker = 0;
				}
				log.info("Creating PUBLISHER '{}' in session",
						loadTestConfig.getUserNamePrefix() + userNumber.get());
				if (needRecordingParticipant()) {
					recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
					String recordingMetadata = testCase.getBrowserMode().getValue() + "_N-N_" + participantsBySession
							+ "_"
							+ participantsBySession + "PSes";
					futureList.add(executorService
							.submit(new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(),
									testCase,
									OpenViduRole.PUBLISHER,
									true, recordingMetadata)));
					tasksInProgress++;
				} else {
					futureList.add(executorService
							.submit(new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
									testCase,
									OpenViduRole.PUBLISHER,
									false, null)));
					browsersInWorker++;
					tasksInProgress++;
				}
				boolean isLastParticipant = i == participantsBySession - 1;
				if (!(isLastParticipant && isLastSession)) {
					if (tasksInProgress >= maxRequestsInFlight) {
						lastResponse = getLastResponse(futureList);
						streamsPerWorker.add(lastResponse.getStreamsInWorker());
						if (!lastResponse.isResponseOk()) {
							return lastResponse;
						}
						futureList = new ArrayList<>(maxRequestsInFlight);
						tasksInProgress = 0;
					}
					sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
				} else {
					lastResponse = getLastResponse(futureList);
					streamsPerWorker.add(lastResponse.getStreamsInWorker());
					if (!lastResponse.isResponseOk()) {
						return lastResponse;
					}
					futureList = new ArrayList<>(maxRequestsInFlight);
				}
			}

			log.info("Session number {} has been succesfully created ", sessionNumber.get());
			sessionsCompleted.incrementAndGet();
			userNumber.set(1);
		}
		return lastResponse;
	}

	public CreateParticipantResponse startNxMTest(int publishers, int subscribers, TestCase testCase) {
		int testCaseSessionsLimit = testCase.getSessions();
		String worker = setAndInitializeNextWorker("", WorkerType.WORKER);
		String recWorker = "";
		ExecutorService executorService = Executors.newFixedThreadPool(loadTestConfig.getMaxRequests());
		CreateParticipantResponse lastResponse = null;
		int tasksSubmittedPerWorker = 0;
		List<Future<CreateParticipantResponse>> futureList = new ArrayList<>(browserEstimation);
		while (needCreateNewSession(testCaseSessionsLimit)) {

			if (sessionNumber.get() > 0) {
				// Waiting time between sessions
				sleep(loadTestConfig.getSecondsToWaitBetweenSession(), "time between sessions");
			}

			sessionNumber.getAndIncrement();
			// log.info("Starting session '{}'", loadTestConfig.getSessionNamePrefix() +
			// sessionNumberStr);
			boolean isLastSession = sessionNumber.get() == testCaseSessionsLimit;
			// Adding all publishers
			for (int i = 0; i < publishers; i++) {
				log.info("Creating PUBLISHER '{}' in session",
						loadTestConfig.getUserNamePrefix() + userNumber.get());
				if (needRecordingParticipant()) {
					recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
					String recordingMetadata = testCase.getBrowserMode().getValue() + "_N-M_" + publishers + "_"
							+ subscribers + "PSes";
					futureList.add(executorService
							.submit(new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(),
									testCase,
									OpenViduRole.PUBLISHER, true, recordingMetadata)));
				} else {
					futureList.add(executorService
							.submit(new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
									testCase, OpenViduRole.PUBLISHER, false, null)));
				}
				tasksSubmittedPerWorker++;
				if ((tasksSubmittedPerWorker >= browserEstimation) && (loadTestConfig.getWorkersRumpUp() > 0)) {
					log.info("Browsers in worker: {} is equals than limit: {}", sessionNumber.get(),
							browserEstimation);
					lastResponse = getLastResponse(futureList);
					streamsPerWorker.add(lastResponse.getStreamsInWorker());
					if (!lastResponse.isResponseOk()) {
						return lastResponse;
					}
					futureList = new ArrayList<>(browserEstimation);
					worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
					tasksSubmittedPerWorker = 0;
				}
				sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
			}

			// Adding all subscribers
			for (int i = 0; i < subscribers; i++) {
				log.info("Creating SUBSCRIBER '{}' in session",
						loadTestConfig.getUserNamePrefix() + userNumber.get());
				if (needRecordingParticipant()) {
					recWorker = setAndInitializeNextWorker(recWorker, WorkerType.RECORDING_WORKER);
					String recordingMetadata = testCase.getBrowserMode().getValue() + "_N-M_" + publishers + "_"
							+ subscribers + "PSes";
					futureList.add(executorService
							.submit(new ParticipantTask(recWorker, userNumber.getAndIncrement(), sessionNumber.get(),
									testCase, OpenViduRole.SUBSCRIBER, true, recordingMetadata)));
				} else {
					futureList.add(executorService
							.submit(new ParticipantTask(worker, userNumber.getAndIncrement(), sessionNumber.get(),
									testCase, OpenViduRole.SUBSCRIBER, false, null)));
				}
				tasksSubmittedPerWorker++;
				boolean isLastParticipant = i == subscribers - 1;
				if (!(isLastParticipant && isLastSession)) {
					if ((tasksSubmittedPerWorker >= browserEstimation) && (loadTestConfig.getWorkersRumpUp() > 0)) {
						log.info("Browsers in worker: {} is equals than limit: {}", sessionNumber.get(),
								browserEstimation);
						lastResponse = getLastResponse(futureList);
						streamsPerWorker.add(lastResponse.getStreamsInWorker());
						if (!lastResponse.isResponseOk()) {
							return lastResponse;
						}
						futureList = new ArrayList<>(browserEstimation);
						worker = setAndInitializeNextWorker(worker, WorkerType.WORKER);
						tasksSubmittedPerWorker = 0;
					}
					sleep(loadTestConfig.getSecondsToWaitBetweenParticipants(), "time between participants");
				} else {
					lastResponse = getLastResponse(futureList);
					streamsPerWorker.add(lastResponse.getStreamsInWorker());
					if (!lastResponse.isResponseOk()) {
						return lastResponse;
					}
					futureList = new ArrayList<>(browserEstimation);
				}
			}
			log.info("Session number {} has been succesfully created ", sessionNumber.get());
			sessionsCompleted.incrementAndGet();
			userNumber.set(1);
		}
		return lastResponse;
	}

	private CreateParticipantResponse getLastResponse(List<Future<CreateParticipantResponse>> futureList) {
		CreateParticipantResponse lastResponse = null;
		for (Future<CreateParticipantResponse> future : futureList) {
			try {
				CreateParticipantResponse futureResponse = future.get();
				if (!futureResponse.isResponseOk()) {
					lastResponse = futureResponse;
					break;
				}
				if ((lastResponse == null) || (futureResponse.getStreamsInWorker() >= lastResponse
						.getStreamsInWorker())) {
					lastResponse = futureResponse;
				}
			} catch (Exception e) {
				log.error("Error while waiting for future", e);
			}
		}
		return lastResponse;
	}

	private boolean needCreateNewSession(int sessionsLimit) {
		return sessionsLimit == -1 || (sessionsLimit > 0 && sessionsCompleted.get() < sessionsLimit);
	}

	private boolean needRecordingParticipant() {
		double medianodeLoadForRecording = loadTestConfig.getMedianodeLoadForRecording();
		int recordingSessionGroup = loadTestConfig.getRecordingSessionGroup();

		boolean isLoadRecordingEnabled = medianodeLoadForRecording > 0 && esClient.isInitialized()
				&& !browserEmulatorClient.isRecordingParticipantCreated(sessionNumber.get())
				&& esClient.getMediaNodeCpu() >= medianodeLoadForRecording;

		boolean isRecordingSessionGroupEnabled = recordingSessionGroup > 0
				&& !browserEmulatorClient.isRecordingParticipantCreated(sessionNumber.get());

		return isLoadRecordingEnabled || isRecordingSessionGroupEnabled;
	}

	private void cleanEnvironment() {

		totalParticipants.set(0);
		sessionsCompleted.set(0);
		sessionNumber.set(0);
		userNumber.set(1);
		workersUsed = 0;
		streamsPerWorker = new ArrayList<>();
		workerStartTimes = new ArrayList<>();
		recordingWorkerStartTimes = new ArrayList<>();
		workerTimes = new ArrayList<>();
		recordingWorkerTimes = new ArrayList<>();
		sleep(loadTestConfig.getSecondsToWaitBetweenTestCases(), "time cleaning environment");
		waitToMediaServerLiveAgain();
	}

	private void waitToMediaServerLiveAgain() {
		if (esClient.isInitialized()) {
			while (esClient.getMediaNodeCpu() > 5.00) {
				this.sleep(5, "Waiting MediaServer recovers his CPU");
			}
		} else {
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
			browserEmulatorClient.disconnectAll(workersUrl);

			// Calculate QoE
			if (loadTestConfig.isQoeAnalysisRecordings() && loadTestConfig.isQoeAnalysisInSitu()) {
				List<Instance> allWorkers = new ArrayList<>(awsWorkersList);
				allWorkers.addAll(recordingWorkersList);
				browserEmulatorClient.calculateQoe(allWorkers);
			}

			ec2Client.stopInstance(recordingWorkersList);
			ec2Client.stopInstance(awsWorkersList);

			Date stopDate = new Date();
			workerTimes = workerStartTimes.stream()
					.map(startTime -> TimeUnit.MINUTES.convert(stopDate.getTime() - startTime.getTime(),
							TimeUnit.MILLISECONDS))
					.collect(Collectors.toList());
			recordingWorkerTimes = recordingWorkerStartTimes.stream()
					.map(startTime -> TimeUnit.MINUTES.convert(stopDate.getTime() - startTime.getTime(),
							TimeUnit.MILLISECONDS))
					.collect(Collectors.toList());
			awsWorkersList = new ArrayList<Instance>();
			recordingWorkersList = new ArrayList<Instance>();

		} else {
			browserEmulatorClient.disconnectAll(workersUrl);
		}
	}

	private void saveResultReport(TestCase testCase, String participantsBySession, CreateParticipantResponse lastCPR) {
		Calendar endTime = Calendar.getInstance();
		endTime.add(Calendar.SECOND, loadTestConfig.getSecondsToWaitBetweenTestCases());
		endTime.add(Calendar.SECOND, 10);

		// Parse date to match with Kibana time filter
		String startTimeStr = formatter.format(this.startTime.getTime()).replace(" ", "T");
		String endTimeStr = formatter.format(endTime.getTime()).replace(" ", "T");
		String kibanaUrl = kibanaClient.getDashboardUrl(startTimeStr, endTimeStr);

		ResultReport rr = new ResultReport().setTotalParticipants(totalParticipants.get())
				.setNumSessionsCompleted(sessionsCompleted.get()).setNumSessionsCreated(sessionNumber.get())
				.setWorkersUsed(workersUsed).setStreamsPerWorker(streamsPerWorker)
				.setSessionTypology(testCase.getTypology().toString())
				.setBrowserModeSelected(testCase.getBrowserMode().toString())
				.setOpenviduRecording(testCase.getOpenviduRecordingMode().toString())
				.setBrowserRecording(testCase.isBrowserRecording()).setParticipantsPerSession(participantsBySession)
				.setStopReason(lastCPR.getStopReason()).setStartTime(this.startTime)
				.setEndTime(endTime).setKibanaUrl(kibanaUrl)
				.setManualParticipantAllocation(loadTestConfig.isManualParticipantsAllocation())
				.setSessionsPerWorker(loadTestConfig.getSessionsPerWorker())
				.setS3BucketName(
						"https://s3.console.aws.amazon.com/s3/buckets/" + loadTestConfig.getS3BucketName())
				.setTimePerWorker(workerTimes).setTimePerRecordingWorker(recordingWorkerTimes)
				.setUserStartTimes(userStartTimes)
				.build();

		io.exportResults(rr);

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
