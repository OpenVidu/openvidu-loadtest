package io.openvidu.loadtest.infrastructure;

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

import javax.annotation.PostConstruct;

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
import io.openvidu.loadtest.models.testcase.WorkerUpdatePolicy;
import io.openvidu.loadtest.utils.CustomHttpClient;
import io.openvidu.loadtest.utils.JsonUtils;

@Service
public class BrowserEmulatorClient {

	private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorClient.class);
	private static List<String> workerUrlList = new ArrayList<String>();
	private static String currentWorkerUrl = "";
	private static final int HTTP_STATUS_OK = 200;
	private static int usedWorkers = 1;

	@Autowired
	private LoadTestConfig loadTestConfig;

	@Autowired
	private CustomHttpClient httpClient;

	@Autowired
	private JsonUtils jsonUtils;

	@PostConstruct
	public void init() {
		workerUrlList = this.loadTestConfig.getWorkerUrlList();
		currentWorkerUrl = workerUrlList.get(0);
	}
	
	public void initializeInstances() {
		ExecutorService executorService = Executors.newFixedThreadPool(workerUrlList.size());
		List<Callable<HttpResponse<String>>> callableTasks = new ArrayList<>();

		for (String workerUrl : workerUrlList) {

			Callable<HttpResponse<String>> callableTask = () -> {
				return this.initializeInstance(workerUrl);
			};
			callableTasks.add(callableTask);
		}
		try {
			//TODO: Refactoring callable task in an external class
			List<Future<HttpResponse<String>>> futures = executorService.invokeAll(callableTasks);
			futures.forEach((future) -> {
				try {
					HttpResponse<String> response = future.get();
					if(response != null && response.statusCode() != HTTP_STATUS_OK) {
						log.error("Error initializing worker {}", response.uri());
					}
				} catch (InterruptedException | ExecutionException e) {
					e.printStackTrace();
				}
			});
			executorService.shutdown();
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}

	public boolean createPublisher(int userNumber, int sessionNumber, int participantsBySession, TestCase testCase) {
		RequestBody body = this.generateRequestBody(userNumber, sessionNumber, OpenViduRole.PUBLISHER, testCase);

		try {
			updateWorkerUrl(sessionNumber, participantsBySession);

			log.info("Selected worker: {}", currentWorkerUrl);
			HttpResponse<String> response = this.httpClient
					.sendPost(currentWorkerUrl + "/openvidu-browser/streamManager", body.toJson(), null, getHeaders());

			if (response.statusCode() != HTTP_STATUS_OK) {
				System.out.println("Error: " + response.body());
				if (testCase.getBrowserMode().equals(BrowserMode.REAL)
						&& response.body().contains("TimeoutError: Waiting for at least one element to be located")) {
					return false;
				}
				System.out.println("Retrying");
				return this.createPublisher(userNumber, sessionNumber, participantsBySession, testCase);
			}
			return processResponse(response);
		} catch (Exception e) {
			if (e.getMessage() != null && e.getMessage().contains("Connection timed out")) {
				return this.createPublisher(userNumber, sessionNumber, participantsBySession, testCase);
			} else if (e.getMessage() != null && e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", currentWorkerUrl, e.getMessage());
				System.exit(1);
			} else if (e.getMessage() != null && e.getMessage().contains("received no bytes")) {
				System.out.println(e.getMessage());
				return true;
			}
			e.printStackTrace();

		}
		return false;
	}

	public boolean createSubscriber(int userNumber, int sessionNumber, int participantsBySession, TestCase testCase) {
		OpenViduRole role = testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : OpenViduRole.SUBSCRIBER;
		RequestBody body = this.generateRequestBody(userNumber, sessionNumber, role, testCase);

		try {
			// TODO: The capacity of sessions with subscribers is not defined
//			updateWorkerUrl(sessionNumber, participantsBySession);

			log.info("Selected worker: {}", currentWorkerUrl);
			HttpResponse<String> response = this.httpClient
					.sendPost(currentWorkerUrl + "/openvidu-browser/streamManager", body.toJson(), null, getHeaders());
			return processResponse(response);
		} catch (IOException | InterruptedException e) {
			if (e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", currentWorkerUrl, e.getMessage());
				System.exit(1);
			}
			e.printStackTrace();
		}
		return false;
	}

	public void disconnectAll() {

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
			usedWorkers = 1;
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}

	public boolean restartAll() {
		for (String workerUrl : workerUrlList) {
			try {

				log.info("Restart worker {}", currentWorkerUrl);
				JsonObject body = new JsonObject();
				HttpResponse<String> response = this.httpClient.sendPost(workerUrl + "/instance/restart", body, null,
						getHeaders());
				processResponse(response);
			} catch (Exception e) {
				// if (e.getMessage().equalsIgnoreCase("Connection refused")) {
				// log.error("Error trying connect with worker on {}: {}", workerUrl,
				// e.getMessage());
				// }
			}
		}
		return true;
	}

	public void updateWorkerUrl(int sessionNumber, int participantsBySession) {

		String updatePolicy = this.loadTestConfig.getUpdateWorkerUrlPolicy();

		if (updatePolicy.equalsIgnoreCase(WorkerUpdatePolicy.CAPACITY.getValue())) {
			// TODO: The capacity number depends of instance resources.
			int mod = -1;
			if (participantsBySession == 2) {
				mod = sessionNumber % 5;
			} else if (participantsBySession == 3) {
				mod = sessionNumber % 3;
			} else if (participantsBySession == 5) {
				mod = sessionNumber % 5;
			} else if (participantsBySession == 8) {
				mod = sessionNumber % 1;
			}
			if (mod == 0) {
				System.out.println("Changing worker");
				int nextIndex = workerUrlList.indexOf(currentWorkerUrl) + 1;
				currentWorkerUrl = workerUrlList.get(nextIndex);
				usedWorkers +=1;
				System.out.println("New worker is: " + currentWorkerUrl);
			}
		} else if (updatePolicy.equalsIgnoreCase(WorkerUpdatePolicy.ROUNDROBIN.getValue())) {

			if (workerUrlList.size() > 1) {
				int nextIndex = workerUrlList.indexOf(currentWorkerUrl) + 1;
				if (nextIndex >= workerUrlList.size()) {
					nextIndex = 0;
				}
				usedWorkers +=1;
				currentWorkerUrl = workerUrlList.get(nextIndex);
			}
		}
	}

	public int getUsedWorkers() {
		if(usedWorkers > workerUrlList.size()) {
			return workerUrlList.size();
		}
		return usedWorkers;
	}
	private String disconnect(String workerUrl) {
		try {
			log.info("Deleting all participants from worker {}", workerUrl);
			Map<String, String> headers = new HashMap<String, String>();
			headers.put("Content-Type", "application/json");
			HttpResponse<String> response = this.httpClient.sendDelete(workerUrl + "/openvidu-browser/streamManager",
					headers);
			return response.body();
		} catch (Exception e) {
			return e.getMessage();
		}
	}
	
	private HttpResponse<String> initializeInstance(String workerUrl) {
		JsonObject body = new RequestBody()
		.elasticSearchHost(this.loadTestConfig.getElasticsearchHost())
		.elasticSearchUserName(this.loadTestConfig.getElasticsearchUserName())
		.elasticSearchPassword(this.loadTestConfig.getElasticsearchPassword()).build().toJson();
		
		try {
			return this.httpClient.sendPost(workerUrl+ "/instance/initialize", body, null, getHeaders());
		} catch (IOException | InterruptedException e) {
			log.error(e.getMessage());
		}
		return null;		
	}

	private boolean processResponse(HttpResponse<String> response) {

		if (response != null && response.statusCode() == HTTP_STATUS_OK) {
			JsonObject jsonResponse = jsonUtils.getJson(response.body());
			String connectionId = jsonResponse.get("connectionId").getAsString();
			String workerCpu = jsonResponse.get("workerCpuUsage").getAsString();
			log.info("Connection {} created", connectionId);
			log.info("Worker CPU USAGE: {}% ", workerCpu);
			return true;
		}
		log.error("Error. Http Status Response {} ", response.statusCode());
		log.error("Response message {} ", response.body());
		return false;
	}

	private RequestBody generateRequestBody(int userNumber, int sessionNumber, OpenViduRole role, TestCase testCase) {

		boolean video = (testCase.is_TEACHING() && role.equals(OpenViduRole.PUBLISHER)) || !testCase.is_TEACHING();

		return new RequestBody().openviduUrl(this.loadTestConfig.getOpenViduUrl())
				.openviduSecret(this.loadTestConfig.getOpenViduSecret()).browserMode(testCase.getBrowserMode())
				.userId(this.loadTestConfig.getUserNamePrefix() + userNumber)
				.sessionName(this.loadTestConfig.getSessionNamePrefix() + sessionNumber).audio(true).video(video)
				.role(role).recording(testCase.isRecording()).showVideoElements(!testCase.isHeadless())// TODO: new
																										// param in
																										// testCase.json?
				.headless(testCase.isHeadless()).build();

	}

	private Map<String, String> getHeaders() {
		Map<String, String> headers = new HashMap<String, String>();
		headers.put("Content-Type", "application/json");
		return headers;
	}

}
