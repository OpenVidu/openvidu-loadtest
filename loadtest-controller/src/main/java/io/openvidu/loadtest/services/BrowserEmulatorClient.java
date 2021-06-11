package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
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
import io.openvidu.loadtest.models.testcase.OpenViduRole;
import io.openvidu.loadtest.models.testcase.RequestBody;
import io.openvidu.loadtest.models.testcase.TestCase;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class BrowserEmulatorClient {

	private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorClient.class);
	private static final int HTTP_STATUS_OK = 200;
	private static final int WORKER_PORT = 5000;
	private static double workerCpuPct = 0;
	private static int streamsInWorker = 0;
	
	private static String stopReason = "Test case finished as expected";

	private static final int WAIT_MS = 2000;

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private CustomHttpClient httpClient;

	@Autowired
	private JsonUtils jsonUtils;

	public void ping(String workerUrl) {
		try {
			log.info("Pinging to {} ...", workerUrl);
			HttpResponse<String> response = this.httpClient
					.sendGet("https://" + workerUrl + ":" + WORKER_PORT + "/instance/ping", getHeaders());
			if (response.statusCode() != HTTP_STATUS_OK) {
				sleep(WAIT_MS);
				log.error("Error doing ping. Retry...");
				ping(workerUrl);
			} else {
				log.info("Ping success. Response {}", response.body());
			}
		} catch (Exception e) {
			log.error(e.getMessage());
			log.error("Error doing ping. Retry...");
			sleep(WAIT_MS);
			ping(workerUrl);
		}
	}

	public HttpResponse<String> initializeInstance(String workerUrl) {
		JsonObject body = new RequestBody().elasticSearchHost(this.loadTestConfig.getElasticsearchHost())
				.elasticSearchUserName(this.loadTestConfig.getElasticsearchUserName())
				.elasticSearchPassword(this.loadTestConfig.getElasticsearchPassword()).build().toJson();

		try {
			log.info("Initialize worker {}", workerUrl);
			return this.httpClient.sendPost("https://" + workerUrl + ":" + WORKER_PORT + "/instance/initialize", body,
					null, getHeaders());
		} catch (IOException | InterruptedException e) {
			log.error(e.getMessage());
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

	public boolean createPublisher(String workerUrl, int userNumber, int sessionNumber, TestCase testCase) {

		// Check if there was an exception on openvidu-browser
		if (WorkerExceptionManager.getInstance().exceptionExist()) {
			stopReason = WorkerExceptionManager.getInstance().getExceptionAndClean();
			log.error("There was an EXCEPTION: {}", stopReason);
			return false;
		}

		RequestBody body = this.generateRequestBody(userNumber, sessionNumber, OpenViduRole.PUBLISHER, testCase);
		
		try {
			log.info("Selected worker: {}", workerUrl);
			HttpResponse<String> response = this.httpClient.sendPost(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager", body.toJson(), null,
					getHeaders());

			if (response.statusCode() != HTTP_STATUS_OK) {
				System.out.println("Error: " + response.body());
				if (testCase.getBrowserMode().equals(BrowserMode.REAL)
						&& response.body().contains("TimeoutError: Waiting for at least one element to be located")) {
					stopReason = "Selenium TimeoutError: Waiting for at least one element to be located on Chrome Browser" + response.body().substring(0, 100);
					return false;
				}

				if (response.body().contains("Exception") || response.body().contains("Error on publishVideo")) {
					stopReason = "OpenVidu Error: " + response.body().substring(0, 100);
					return false;
				}
				System.out.println("Retrying");
				sleep(WAIT_MS);
				return this.createPublisher(workerUrl, userNumber, sessionNumber, testCase);
			}
			return processResponse(response);
		} catch (Exception e) {
			if (e.getMessage() != null && e.getMessage().contains("Connection timed out")) {
				sleep(WAIT_MS);
				return this.createPublisher(workerUrl, userNumber, sessionNumber, testCase);
			} else if (e.getMessage() != null && e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
				System.exit(1);
			} else if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				System.out.println(e.getMessage());
				return true;
			}
			e.printStackTrace();
		}
		return false;
	}

	public boolean createSubscriber(String workerUrl, int userNumber, int sessionNumber, TestCase testCase) {

		// Check if there was an exception on openvidu-browser
		if (WorkerExceptionManager.getInstance().exceptionExist()) {
			stopReason = WorkerExceptionManager.getInstance().getExceptionAndClean();
			log.error("There was an EXCEPTION: {}", stopReason);
			return false;
		}

		OpenViduRole role = testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : OpenViduRole.SUBSCRIBER;
		RequestBody body = this.generateRequestBody(userNumber, sessionNumber, role, testCase);

		try {
			log.info("Selected worker: {}", workerUrl);
			HttpResponse<String> response = this.httpClient.sendPost(
					"https://" + workerUrl + ":" + WORKER_PORT + "/openvidu-browser/streamManager", body.toJson(), null,
					getHeaders());
			if (response.statusCode() != HTTP_STATUS_OK) {
				System.out.println("Error: " + response.body());
				if (testCase.getBrowserMode().equals(BrowserMode.REAL)
						&& response.body().contains("TimeoutError: Waiting for at least one element to be located")) {
					stopReason = "Selenium TimeoutError: Waiting for at least one element to be located on Chrome Browser" + response.body().substring(0, 100);
					return false;
				}

				if (response.body().contains("Exception") || response.body().contains("Error on publishVideo")) {
					stopReason = "OpenVidu Error: " + response.body().substring(0, 100);
					return false;
				}
				System.out.println("Retrying");
				sleep(WAIT_MS);
				return this.createSubscriber(workerUrl, userNumber, sessionNumber, testCase);
			}
			return processResponse(response);
		} catch (IOException | InterruptedException e) {
			if (e.getMessage() != null && e.getMessage().contains("Connection timed out")) {
				sleep(WAIT_MS);
				return this.createSubscriber(workerUrl, userNumber, sessionNumber, testCase);
			} else if (e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
				System.exit(1);
			} else if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				System.out.println(e.getMessage());
				return true;
			}
			e.printStackTrace();
		}
		return false;
	}

	public void disconnectAll(List<String> workerUrlList) {
		stopReason = "Test case finished as expected";
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
			log.info("Participants disconnected");
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}

	public double getWorkerCpuPct() {
		return workerCpuPct;
	}
	
	public int getStreamsInWorker() {
		return streamsInWorker;
	}
	
	public String getStopReason() {
		return stopReason;
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

	private boolean processResponse(HttpResponse<String> response) {

		if (response != null && response.statusCode() == HTTP_STATUS_OK) {
			JsonObject jsonResponse = jsonUtils.getJson(response.body());
			String connectionId = jsonResponse.get("connectionId").getAsString();
			workerCpuPct = jsonResponse.get("workerCpuUsage").getAsDouble();
			streamsInWorker = jsonResponse.get("streams").getAsInt(); 
			log.info("Connection {} created", connectionId);
			log.info("Worker CPU USAGE: {}% ", workerCpuPct);
			log.info("Worker STREAMS CREATED: {} ", streamsInWorker);
			return true;
		}
		log.error("Error. Http Status Response {} ", response.statusCode());
		log.error("Response message {} ", response.body());
		stopReason = response.body().substring(0, 100);
		return false;
	}

// @formatter:off
	private RequestBody generateRequestBody(int userNumber, int sessionNumber, OpenViduRole role, TestCase testCase) {
		boolean video = (testCase.is_TEACHING() && role.equals(OpenViduRole.PUBLISHER)) || !testCase.is_TEACHING();
		return new RequestBody().
				openviduUrl(this.loadTestConfig.getOpenViduUrl())
				.openviduSecret(this.loadTestConfig.getOpenViduSecret())
				.browserMode(testCase.getBrowserMode())
				.frameRate(testCase.getFrameRate())
				.userId(this.loadTestConfig.getUserNamePrefix() + userNumber)
				.sessionName(this.loadTestConfig.getSessionNamePrefix() + sessionNumber)
				.audio(true)
				.video(video)
				.role(role)
				.openviduRecordingMode(testCase.getOpenviduRecordingMode())
				.browserRecording(testCase.isBrowserRecording())
				.showVideoElements(testCase.isShowBrowserVideoElements())
				.headlessBrowser(testCase.isHeadlessBrowser())
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

}
