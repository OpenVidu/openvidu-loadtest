package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.amazonaws.services.ec2.model.Instance;
import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.config.modules.LKLoadTestConfig;
import io.openvidu.loadtest.models.testcase.BrowserMode;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.request.InitializeRequestBody;
import io.openvidu.loadtest.models.testcase.request.modules.LKCreateUserRequestBody;
import io.openvidu.loadtest.models.testcase.request.CreateUserRequestBody;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class BrowserEmulatorClient {

	private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorClient.class);
	private static final int HTTP_STATUS_OK = 200;
	private static final int WORKER_PORT = 5000;
	public static final String LOADTEST_INDEX = "loadtest-webrtc-stats-" + System.currentTimeMillis();
	private static List<Integer> recordingParticipantCreated = new ArrayList<Integer>();
	private static Map<String, int[]> publishersAndSubscribersInWorker = new ConcurrentHashMap<String, int[]>();

	private static final int WAIT_MS = 1000;

	private LoadTestConfig loadTestConfig;

	private CustomHttpClient httpClient;

	private JsonUtils jsonUtils;

	private ConcurrentHashMap<String, ConcurrentHashMap<String, Integer>> clientFailures = new ConcurrentHashMap<>();
	private ConcurrentHashMap<String, ConcurrentHashMap<String, OpenViduRole>> clientRoles = new ConcurrentHashMap<>();
	private ConcurrentHashMap<String, TestCase> participantTestCases = new ConcurrentHashMap<>();

	public BrowserEmulatorClient(LoadTestConfig loadTestConfig, CustomHttpClient httpClient, JsonUtils jsonUtils) {
		this.loadTestConfig = loadTestConfig;
		this.httpClient = httpClient;
		this.jsonUtils = jsonUtils;
	}

	public void ping(String workerUrl) {
		try {
			log.info("Pinging to {} ...", workerUrl);
			HttpResponse<String> response = this.httpClient
					.sendGet("https://" + workerUrl + ":" + WORKER_PORT + "/instance/ping", getHeaders());
			if (response.statusCode() != HTTP_STATUS_OK) {
				log.error("Error doing ping. Retry...");
				sleep(WAIT_MS);
				ping(workerUrl);
			} else {
				log.info("Ping success. Response {}", response.body());
			}
		} catch (Exception e) {
			log.error(e.getMessage());
			log.error("Error doing ping. Retry...");
			ping(workerUrl);
		}
	}

	public HttpResponse<String> initializeInstance(String workerUrl) {
		JsonObject body = new InitializeRequestBody(this.loadTestConfig, LOADTEST_INDEX).toJson();
		try {
			log.info("Initialize worker {}", workerUrl);
			return this.httpClient.sendPost("https://" + workerUrl + ":" + WORKER_PORT + "/instance/initialize", body,
					null, getHeaders());
		} catch (IOException | InterruptedException e) {
			log.error(e.getMessage());
			this.sleep(WAIT_MS);
			if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				log.warn("Retrying");
				return this.initializeInstance(workerUrl);
			}
		}
		return null;
	}

	public void addClientFailure(String workerUrl, String participant, String session) {
		ConcurrentHashMap<String, Integer> failures = this.clientFailures.get(workerUrl);
		if (failures == null) {
			failures = new ConcurrentHashMap<>();
			this.clientFailures.put(workerUrl, failures);
		}
		String user = participant + "-" + session;
		Integer currentFailures = failures.get(participant);
		if (currentFailures == null) {
			currentFailures = 0;
		}
		failures.put(user, currentFailures + 1);
		log.error("Participant {} in session {} failed {} times", participant, session, currentFailures + 1);
		this.reconnect(workerUrl, participant, session);
	}

	private void reconnect(String workerUrl, String participant, String session) {
		ExecutorService executorService = Executors.newFixedThreadPool(1);
		Callable<String> callableTask = () -> {
			return this.disconnectUser(workerUrl, participant, session);
		};
		try {
			Future<String> future = executorService.submit(callableTask);
			log.info(future.get());
			executorService.shutdown();
			String user = participant + "-" + session;
			OpenViduRole role = this.clientRoles.get(workerUrl).get(user);
			// get user number from participant removing prefix
			int userNumber = Integer.parseInt(participant.replace(loadTestConfig.getUserNamePrefix(), ""));
			// get session number from session removing prefix
			int sessionNumber = Integer.parseInt(session.replace(loadTestConfig.getSessionNamePrefix(), ""));
			if (role.equals(OpenViduRole.PUBLISHER)) {
				this.createPublisher(workerUrl, userNumber, sessionNumber, this.participantTestCases.get(user));
			} else {
				this.createSubscriber(workerUrl, userNumber, sessionNumber, this.participantTestCases.get(user));
			}
		} catch (InterruptedException ie) {
			ie.printStackTrace();
		} catch (ExecutionException ee) {
			ee.printStackTrace();
			log.error(ee.getCause().getMessage());
		}
	}

	private String disconnectUser(String workerUrl, String participant, String session) {
		try {
			log.info("Deleting participant {} from worker {}", participant, workerUrl);
			Map<String, String> headers = new HashMap<String, String>();
			headers.put("Content-Type", "application/json");
			HttpResponse<String> response = this.httpClient.sendDelete(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager/session" + session + "/user/" + participant, headers);
			log.info("Participant {} in worker {} deleted", participant, workerUrl);
			return response.body();
		} catch (Exception e) {
			log.error(e.getMessage());
			return e.getMessage();
		}
	}

	private void addClient(String workerUrl, int userNumber, int sessionNumber, OpenViduRole role, TestCase testCase) {
		ConcurrentHashMap<String, OpenViduRole> roles = this.clientRoles.get(workerUrl);
		if (roles == null) {
			roles = new ConcurrentHashMap<>();
			this.clientRoles.put(workerUrl, roles);
		}
		String participant = this.loadTestConfig.getUserNamePrefix() + userNumber;
		String session = this.loadTestConfig.getSessionNamePrefix() + sessionNumber;
		String user = participant + "-" + session;
		roles.put(user, role);

		this.participantTestCases.put(user, testCase);
	}

	public CreateParticipantResponse createPublisher(String worker, int userNumber, int sessionNumber, TestCase testCase) {
		TestCase finalTestCase = testCase;
		if (testCase.isBrowserRecording()) {
			finalTestCase = new TestCase(testCase);
			finalTestCase.setBrowserRecording(false);
		}
		CreateParticipantResponse success = this.createParticipant(worker, userNumber, sessionNumber,
				finalTestCase,
				OpenViduRole.PUBLISHER);
		this.addClient(worker, userNumber, sessionNumber, OpenViduRole.PUBLISHER, testCase);
		return success;
	}

	public CreateParticipantResponse createSubscriber(String worker, int userNumber, int sessionNumber, TestCase testCase) {
		TestCase finalTestCase = testCase;
		if (testCase.isBrowserRecording()) {
			finalTestCase = new TestCase(testCase);
			finalTestCase.setBrowserRecording(false);
		}
		OpenViduRole role = OpenViduRole.SUBSCRIBER;
		CreateParticipantResponse success = this.createParticipant(worker, userNumber, sessionNumber,
				finalTestCase, role);

		this.addClient(worker, userNumber, sessionNumber, OpenViduRole.SUBSCRIBER, testCase);
		return success;
	}

	public CreateParticipantResponse createExternalRecordingPublisher(String worker, int userNumber, int sessionNumber,
			TestCase testCase, String recordingMetadata) {
		return this.createExternalRecordingParticipant(worker, userNumber, sessionNumber, testCase,
				recordingMetadata, OpenViduRole.PUBLISHER);
	}

	public CreateParticipantResponse createExternalRecordingSubscriber(String worker, int userNumber, int sessionNumber,
			TestCase testCase, String recordingMetadata) {
		return this.createExternalRecordingParticipant(worker, userNumber, sessionNumber, testCase,
				recordingMetadata, OpenViduRole.SUBSCRIBER);
	}

	public void disconnectAll(List<String> workerUrlList) {
		ExecutorService executorService = Executors.newFixedThreadPool(workerUrlList.size());
		List<Callable<String>> callableTasks = new ArrayList<>();

		for (String workerUrl : workerUrlList) {

			Callable<String> callableTask = () -> {
				return this.disconnect(workerUrl);
			};
			callableTasks.add(callableTask);
		}
		try {
			// TODO: Refactoring callable task in an external class
			List<Future<String>> futures = executorService.invokeAll(callableTasks);
			futures.forEach((future) -> {
				try {
					log.info(future.get());
				} catch (InterruptedException | ExecutionException e) {
					e.printStackTrace();
				}
			});
			executorService.shutdown();
			recordingParticipantCreated = new ArrayList<>();
			log.info("Participants disconnected");
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}

	public boolean isRecordingParticipantCreated(int sessionNumber) {
		return recordingParticipantCreated.contains(sessionNumber);
	}

	public String disconnect(String workerUrl) {
		try {
			log.info("Deleting all participants from worker {}", workerUrl);
			Map<String, String> headers = new HashMap<String, String>();
			headers.put("Content-Type", "application/json");
			HttpResponse<String> response = this.httpClient.sendDelete(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager", headers);
			log.info("Participants in worker {} deleted", workerUrl);
			return response.body();
		} catch (Exception e) {
			return e.getMessage();
		}
	}

	private CreateParticipantResponse createParticipant(String workerUrl, int userNumber, int sessionNumber,
			TestCase testCase,
			OpenViduRole role) {
		CreateParticipantResponse cpr = new CreateParticipantResponse();

		// Get current failures if registered
		String userId = this.loadTestConfig.getUserNamePrefix() + userNumber;
		String sessionId = this.loadTestConfig.getSessionNamePrefix() + sessionNumber;
		String user = userId + "-" + sessionId;
		ConcurrentHashMap<String, Integer> failuresMap = this.clientFailures.get(workerUrl);
		int failures = 0;
		if (failuresMap != null) {
			Integer userFailures = failuresMap.get(user);
			if (userFailures != null) {
				failures = userFailures;
			}
		}

		String sessionSuffix = String.valueOf(sessionNumber);
		CreateUserRequestBody body = this.generateRequestBody(userNumber, sessionSuffix, role, testCase);
		try {
			log.info("Selected worker: {}", workerUrl);
			log.info("Creating participant {} in session {}", userNumber, sessionSuffix);
			HttpResponse<String> response = this.httpClient.sendPost(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager", body.toJson(), null,
					getHeaders());

			if (response.statusCode() != HTTP_STATUS_OK) {
				log.warn("Error: " + response.body());
				failures++;
				if (failuresMap != null) {
					failuresMap.put(user, failures);
				} else {
					failuresMap = new ConcurrentHashMap<>();
					failuresMap.put(user, failures);
					this.clientFailures.put(workerUrl, failuresMap);
				}
				// lastResponses.add("Failure");
				// if (testCase.getBrowserMode().equals(BrowserMode.REAL)
				// 		&& response.body().contains("TimeoutError: Waiting for at least one element to be located")) {
				// 	String stopReason = "Selenium TimeoutError: Waiting for at least one element to be located on Chrome Browser"
				// 			+ response.body().substring(0, 100);
				// 	return cpr.setResponseOk(false).setStopReason(stopReason);
				// }
				// if (response.body().contains("Exception") || response.body().contains("Error on publishVideo")) {
				// 	String stopReason = "OpenVidu Error: " + response.body().substring(0, 100);
				// 	return cpr.setResponseOk(false).setStopReason(stopReason);
				// }
				// if (response.body().toString().contains("Gateway Time-out")) {
				// 	String stopReason = "OpenVidu Error: " + response.body();
				// 	return cpr.setResponseOk(false).setStopReason(stopReason);
				// }
				sleep(WAIT_MS);
				if (loadTestConfig.isRetryMode() && isResponseLimitReached(failures)) {
					return cpr.setResponseOk(false);
				}
				log.warn("Retrying");
				return this.createParticipant(workerUrl, userNumber, sessionNumber, testCase, role);
			} else {
				this.saveParticipantData(workerUrl, testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : role);
			}
			return processResponse(response);
		} catch (Exception e) {
			// lastResponses.add("Failure");
			if (e.getMessage() != null && e.getMessage().contains("Connection timed out")) {
				sleep(WAIT_MS);
				return this.createParticipant(workerUrl, userNumber, sessionNumber, testCase, role);
			} else if (e.getMessage() != null && e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
				sleep(WAIT_MS);
				return this.createParticipant(workerUrl, userNumber, sessionNumber, testCase, role);
			} else if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				log.error(workerUrl + ": " + e.getMessage());
				return cpr.setResponseOk(true);
			}
			e.printStackTrace();
			return cpr.setResponseOk(false);
		}

	}

	private void saveParticipantData(String workerUrl, OpenViduRole role) {
		int[] initialArray = { 0, 0 };
		BrowserEmulatorClient.publishersAndSubscribersInWorker.putIfAbsent(workerUrl, initialArray);
		int[] list = BrowserEmulatorClient.publishersAndSubscribersInWorker.get(workerUrl);
		if (role.equals(OpenViduRole.PUBLISHER)) {
			list[0] = list[0] + 1;
		} else {
			list[1] = list[1] + 1;
		}
	}

	private CreateParticipantResponse createExternalRecordingParticipant(String worker, int userNumber, int sessionNumber,
			TestCase testCase, String recordingMetadata, OpenViduRole role) {

		TestCase testCaseAux = new TestCase(testCase);
		testCaseAux.setBrowserMode(BrowserMode.REAL);
		testCaseAux.setBrowserRecording(true);
		testCaseAux.setRecordingMetadata(recordingMetadata);
		log.info("Creating a participant using a REAL BROWSER for recoding");
		CreateParticipantResponse okResponse = this.createParticipant(worker, userNumber,
				sessionNumber, testCaseAux, role);
		if (okResponse.isResponseOk()) {
			recordingParticipantCreated.add(sessionNumber);
		}
		return okResponse;
	}

	private CreateParticipantResponse processResponse(HttpResponse<String> response) {
		CreateParticipantResponse cpr = new CreateParticipantResponse();
		if (response != null && response.statusCode() == HTTP_STATUS_OK) {
			JsonObject jsonResponse = jsonUtils.getJson(response.body());
			String connectionId = jsonResponse.get("connectionId").getAsString();
			double workerCpuPct = jsonResponse.get("workerCpuUsage").getAsDouble();
			int streamsInWorker = jsonResponse.get("streams").getAsInt();
			int participantsInWorker = jsonResponse.get("participants").getAsInt();
			String userId = jsonResponse.get("userId").getAsString();
			String sessionId = jsonResponse.get("sessionId").getAsString();
			log.info("Connection {} created", connectionId);
			log.info("Worker CPU USAGE: {}% ", workerCpuPct);
			log.info("Worker STREAMS PROCESSED: {} ", streamsInWorker);
			log.info("Worker PARTICIPANTS: {} ", participantsInWorker);
			return cpr.setResponseOk(true).setConnectionId(connectionId)
					.setUserId(userId).setSessionId(sessionId)
					.setWorkerCpuPct(workerCpuPct).setStreamsInWorker(streamsInWorker)
					.setParticipantsInWorker(participantsInWorker);
		}
		log.error("Error. Http Status Response {} ", response.statusCode());
		log.error("Response message {} ", response.body());
		String stopReason = response.body().substring(0, 100);
		return cpr.setResponseOk(false).setStopReason(stopReason);
	}

	private boolean isResponseLimitReached(int failures) {
		return failures == loadTestConfig.getRetryTimes();
	}

// @formatter:off
	private LKCreateUserRequestBody generateRequestBody(int userNumber, String sessionNumber, OpenViduRole role, TestCase testCase) {
		// TODO: make more generic
		boolean video = (testCase.is_TEACHING() && role.equals(OpenViduRole.PUBLISHER)) || !testCase.is_TEACHING();
		OpenViduRole actualRole = testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : role;
		boolean audio = true;
		String userId = this.loadTestConfig.getUserNamePrefix() + userNumber;
		String sessionId = this.loadTestConfig.getSessionNamePrefix() + sessionNumber;

		return new LKCreateUserRequestBody((LKLoadTestConfig) loadTestConfig, testCase, video, audio, actualRole, userId, sessionId);
	}
// @formatter:on

	private Map<String, String> getHeaders() {
		Map<String, String> headers = new HashMap<String, String>();
		headers.put("Content-Type", "application/json");
		return headers;
	}

	private void sleep(int seconds) {
		try {
			Thread.sleep(seconds);
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}

	public int getRoleInWorker(String workerUrl, OpenViduRole role) {
		Integer idx = role.equals(OpenViduRole.PUBLISHER) ? 0 : 1;
		int[] initialArray = { 0, 0 };
		BrowserEmulatorClient.publishersAndSubscribersInWorker
				.putIfAbsent(workerUrl, initialArray);
		return BrowserEmulatorClient.publishersAndSubscribersInWorker
				.get(workerUrl)[idx];
	}

	public void calculateQoe(List<Instance> workersList) {
		ExecutorService executorService = Executors.newFixedThreadPool(workersList.size());
		List<String> workerUrlsList = workersList.stream().map(Instance::getPublicDnsName).collect(Collectors.toList());
		List<Callable<String>> callableTasks = new ArrayList<>();
		try {
			for (String workerUrl : workerUrlsList) {
				Callable<String> callable = new Callable<String>() {
					@Override
					public String call() throws Exception {
						return httpClient.sendPost(
								"https://" + workerUrl + ":" + WORKER_PORT + "/qoe/analysis", null, null,
								getHeaders()).body();
					}
				};
				callableTasks.add(callable);
			}
			List<Future<String>> futures = executorService.invokeAll(callableTasks);
			List<Integer> remainingFilesList = new ArrayList<>(futures.size());
			for (Future<String> future : futures) {
				String response = future.get();
				JsonObject jsonResponse = jsonUtils.getJson(response);
				int remainingFiles = jsonResponse.get("remainingFiles").getAsInt();
				remainingFilesList.add(remainingFiles);
			}
			log.info("Waiting for all workers to finish QoE analysis (list of remaining files): {}", remainingFilesList);
			boolean allDone = false;
			while (!allDone) {
				allDone = true;
				List<Callable<String>> statusCallableTasks = new ArrayList<>();
				for (String workerUrl : workerUrlsList) {
					Callable<String> callable = new Callable<String>() {
						@Override
						public String call() throws Exception {
							return httpClient.sendGet(
									"https://" + workerUrl + ":" + WORKER_PORT + "/qoe/analysis/status", getHeaders()).body();
						}
					};
					statusCallableTasks.add(callable);
				}
				List<Future<String>> statusFutures = executorService.invokeAll(callableTasks);
				List<Integer> currentRemainingFilesList = new ArrayList<>(statusFutures.size());
				for (Future<String> future : statusFutures) {
					String response = future.get();
					JsonObject jsonResponse = jsonUtils.getJson(response);
					int remainingFiles = jsonResponse.get("remainingFiles").getAsInt();
					currentRemainingFilesList.add(remainingFiles);
					if (remainingFiles != 0) {
						allDone = false;
					}
				}
				if (!allDone) {
					log.info("Waiting for all workers to finish QoE analysis (list of remaining files): {}", currentRemainingFilesList);
				}
			}
			log.info("Finished QoE Analysis, results can be found in the S3 Bucket");
		} catch (Exception e) {
			log.error(e.getMessage());
		}
	}
}
