package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.BrowserMode;
import io.openvidu.loadtest.models.testcase.CreateParticipantResponse;
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.RequestBody;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.models.testcase.WorkerType;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class BrowserEmulatorClient {

	private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorClient.class);
	private static final int HTTP_STATUS_OK = 200;
	private static final int WORKER_PORT = 5000;
	private static final String LOADTEST_INDEX = "loadtest-webrtc-stats-" + System.currentTimeMillis();
	private static List<Integer> recordingParticipantCreated = new ArrayList<Integer>();
	private static Map<String, int[]> publishersAndSubscribersInWorker = new ConcurrentHashMap<String, int[]>();

	private static final int WAIT_MS = 1000;

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private CustomHttpClient httpClient;

	@Autowired
	private JsonUtils jsonUtils;

	@Autowired
	private CurrentWorkerService currentWorkers;

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
		JsonObject body = new RequestBody().elasticSearchHost(this.loadTestConfig.getElasticsearchHost())
				.elasticSearchUserName(this.loadTestConfig.getElasticsearchUserName())
				.elasticSearchPassword(this.loadTestConfig.getElasticsearchPassword())
				.elasticSearchIndex(LOADTEST_INDEX)
				.awsAccessKey(this.loadTestConfig.getAwsAccessKey())
				.awsSecretAccessKey(this.loadTestConfig.getAwsSecretAccessKey())
				.s3BucketName(loadTestConfig.getS3BucketName())
				.qoeAnalysis(loadTestConfig.isQoeAnalysis()).build().toJson();
		try {
			log.info("Initialize worker {}", workerUrl);
			return this.httpClient.sendPost("https://" + workerUrl + ":" + WORKER_PORT + "/instance/initialize", body,
					null, getHeaders());
		} catch (IOException | InterruptedException e) {
			log.error(e.getMessage());
			this.sleep(WAIT_MS);
			if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				System.out.println("Retrying");
				return this.initializeInstance(workerUrl);
			}
		}
		return null;
	}

//	public void initializeInstances() {
//		ExecutorService executorService = Executors.newFixedThreadPool(workerUrlList.size());
//		List<Callable<HttpResponse<String>>> callableTasks = new ArrayList<>();
//
//		for (String workerUrl : workerUrlList) {
//
//			Callable<HttpResponse<String>> callableTask = () -> {
//				return this.initializeInstance(workerUrl);
//			};
//			callableTasks.add(callableTask);
//		}
//		try {
//			//TODO: Refactoring callable task in an external class
//			List<Future<HttpResponse<String>>> futures = executorService.invokeAll(callableTasks);
//			futures.forEach((future) -> {
//				try {
//					HttpResponse<String> response = future.get();
//					if(response != null && response.statusCode() != HTTP_STATUS_OK) {
//						log.error("Error initializing worker {}", response.uri());
//					}
//				} catch (InterruptedException | ExecutionException e) {
//					e.printStackTrace();
//				}
//			});
//			executorService.shutdown();
//		} catch (InterruptedException e) {
//			e.printStackTrace();
//		}
//	}

	public CreateParticipantResponse createPublisher(int userNumber, int sessionNumber, TestCase testCase) {
		return createPublisher(userNumber, sessionNumber, testCase, 0);
	}

	private CreateParticipantResponse createPublisher(int userNumber, int sessionNumber, TestCase testCase, int failures) {
		TestCase finalTestCase = testCase;
		if (testCase.isBrowserRecording()) {
			finalTestCase = new TestCase(testCase);
			finalTestCase.setBrowserRecording(false);
		}
		CreateParticipantResponse success = this.createParticipant(WorkerType.WORKER, userNumber, sessionNumber, finalTestCase,
				OpenViduRole.PUBLISHER);

		if (!success.isResponseOk() && loadTestConfig.isRetryMode() && !isResponseLimitReached(failures)) {
			return this.createPublisher(userNumber, sessionNumber, testCase, failures + 1);
		}
		return success;
	}

	public CreateParticipantResponse createSubscriber(int userNumber, int sessionNumber, TestCase testCase) {
		return createSubscriber(userNumber, sessionNumber, testCase, 0);
	}

	private CreateParticipantResponse createSubscriber(int userNumber, int sessionNumber, TestCase testCase, int failures) {
		TestCase finalTestCase = testCase;
		if (testCase.isBrowserRecording()) {
			finalTestCase = new TestCase(testCase);
			finalTestCase.setBrowserRecording(false);
		}
		OpenViduRole role = OpenViduRole.SUBSCRIBER;
		CreateParticipantResponse success = this.createParticipant(WorkerType.WORKER, userNumber, sessionNumber, finalTestCase, role);

		if (!success.isResponseOk() && loadTestConfig.isRetryMode() && !isResponseLimitReached(failures)) {
			return this.createSubscriber(userNumber, sessionNumber, testCase, failures + 1);
		}
		return success;
	}

	public CreateParticipantResponse createExternalRecordingPublisher(int userNumber, int sessionNumber,
			TestCase testCase, String recordingMetadata) {
		return this.createExternalRecordingParticipant(userNumber, sessionNumber, testCase,
				recordingMetadata, OpenViduRole.PUBLISHER);
	}

	public CreateParticipantResponse createExternalRecordingSubscriber(int userNumber, int sessionNumber,
			TestCase testCase, String recordingMetadata) {
		return this.createExternalRecordingParticipant(userNumber, sessionNumber, testCase,
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

	private String disconnect(String workerUrl) {
		try {
			log.info("Deleting all participants from worker {}", workerUrl);
			Map<String, String> headers = new HashMap<String, String>();
			headers.put("Content-Type", "application/json");
			HttpResponse<String> response = this.httpClient.sendDelete(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager", headers);
			return response.body();
		} catch (Exception e) {
			return e.getMessage();
		}
	}

	private CreateParticipantResponse createParticipant(WorkerType currentWorkerType, int userNumber, int sessionNumber, TestCase testCase,
			OpenViduRole role) {
		CreateParticipantResponse cpr = new CreateParticipantResponse();
		int failures = 0;
		// Check if there was an exception on openvidu-browser
		if (WorkerExceptionManager.getInstance().exceptionExist()) {
			String stopReason = WorkerExceptionManager.getInstance().getExceptionAndClean();
			failures++;
			// lastResponses.add("Failure");
			log.error("There was an EXCEPTION: {}", stopReason);
			return cpr.setResponseOk(false).setStopReason(stopReason);
		}

		String sessionSuffix = String.valueOf(sessionNumber);
		RequestBody body = this.generateRequestBody(userNumber, sessionSuffix, role, testCase);
		String workerUrl = currentWorkers.getCurrentWorkerUrl(currentWorkerType);
		try {
			log.info("Selected worker: {}", workerUrl);
			log.info("Creating participant {} in session {}", userNumber, sessionSuffix);
			HttpResponse<String> response = this.httpClient.sendPost(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager", body.toJson(), null,
					getHeaders());

			if (response.statusCode() != HTTP_STATUS_OK) {
				System.out.println("Error: " + response.body());
				failures++;
				// lastResponses.add("Failure");
				if (testCase.getBrowserMode().equals(BrowserMode.REAL)
						&& response.body().contains("TimeoutError: Waiting for at least one element to be located")) {
					String stopReason = "Selenium TimeoutError: Waiting for at least one element to be located on Chrome Browser"
							+ response.body().substring(0, 100);
					return cpr.setResponseOk(false).setStopReason(stopReason);
				}
				if (response.body().contains("Exception") || response.body().contains("Error on publishVideo")) {
					String stopReason = "OpenVidu Error: " + response.body().substring(0, 100);
					return cpr.setResponseOk(false).setStopReason(stopReason);
				}
				if (response.body().toString().contains("Gateway Time-out")) {
					String stopReason = "OpenVidu Error: " + response.body();
					return cpr.setResponseOk(false).setStopReason(stopReason);
				}
				System.out.println("Retrying");
				sleep(WAIT_MS);
				if (loadTestConfig.isRetryMode() && isResponseLimitReached(failures)) {
					return cpr.setResponseOk(false);
				}
				return this.createParticipant(currentWorkerType, userNumber, sessionNumber, testCase, role);
			} else {
				this.saveParticipantData(workerUrl, testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : role);
			}
			return processResponse(response);
		} catch (Exception e) {
			//lastResponses.add("Failure");
			if (e.getMessage() != null && e.getMessage().contains("Connection timed out")) {
				sleep(WAIT_MS);
				return this.createParticipant(currentWorkerType, userNumber, sessionNumber, testCase, role);
			} else if (e.getMessage() != null && e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
				sleep(WAIT_MS);
				return this.createParticipant(currentWorkerType, userNumber, sessionNumber, testCase, role);
			} else if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				System.out.println(e.getMessage());
				return cpr.setResponseOk(true);
			}
			e.printStackTrace();
			return cpr.setResponseOk(false);
		}

	}

	private void saveParticipantData(String workerUrl, OpenViduRole role) {
		int[] initialArray = {0, 0};
		BrowserEmulatorClient.publishersAndSubscribersInWorker.putIfAbsent(workerUrl, initialArray);
		int[] list = BrowserEmulatorClient.publishersAndSubscribersInWorker.get(workerUrl);
		if (role.equals(OpenViduRole.PUBLISHER)) {
			list[0] = list[0] + 1;
		} else {
			list[1] = list[1] + 1;
		}
	}

	private CreateParticipantResponse createExternalRecordingParticipant(int userNumber, int sessionNumber,
			TestCase testCase, String recordingMetadata, OpenViduRole role) {

		TestCase testCaseAux = new TestCase(testCase);
		testCaseAux.setBrowserMode(BrowserMode.REAL);
		testCaseAux.setBrowserRecording(true);
		testCaseAux.setRecordingMetadata(recordingMetadata);
		log.info("Creating a participant using a REAL BROWSER for recoding");
		CreateParticipantResponse okResponse = this.createParticipant(WorkerType.RECORDING_WORKER, userNumber, sessionNumber, testCaseAux, role);
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
	private RequestBody generateRequestBody(int userNumber, String sessionNumber, OpenViduRole role, TestCase testCase) {
		boolean video = (testCase.is_TEACHING() && role.equals(OpenViduRole.PUBLISHER)) || !testCase.is_TEACHING();
		OpenViduRole actualRole = testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : role;
		
		return new RequestBody().
				openviduUrl(this.loadTestConfig.getOpenViduUrl())
				.openviduSecret(this.loadTestConfig.getOpenViduSecret())
				.browserMode(testCase.getBrowserMode())
				.resolution(testCase.getResolution())
				.frameRate(testCase.getFrameRate())
				.userId(this.loadTestConfig.getUserNamePrefix() + userNumber)
				.sessionName(this.loadTestConfig.getSessionNamePrefix() + sessionNumber)
				.audio(true)
				.video(video)
				.role(actualRole)
				.openviduRecordingMode(testCase.getOpenviduRecordingMode())
				.browserRecording(testCase.isBrowserRecording())
				.showVideoElements(testCase.isShowBrowserVideoElements())
				.headlessBrowser(testCase.isHeadlessBrowser())
				.recordingMetadata(testCase.getRecordingMetadata())
				.build();
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

	public int getRoleInWorker(WorkerType currentWorkerType, OpenViduRole role) {
		Integer idx = role.equals(OpenViduRole.PUBLISHER) ? 0 : 1;
		int[] initialArray = {0, 0};
		BrowserEmulatorClient.publishersAndSubscribersInWorker.putIfAbsent(currentWorkers.getCurrentWorkerUrl(currentWorkerType), initialArray);
		return BrowserEmulatorClient.publishersAndSubscribersInWorker.get(currentWorkers.getCurrentWorkerUrl(currentWorkerType))[idx];
	}

}
