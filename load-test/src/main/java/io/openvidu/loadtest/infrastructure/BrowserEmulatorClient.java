package io.openvidu.loadtest.infrastructure;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
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

	public boolean createPublisher(int userNumber, int sessionNumber, int participantsBySession, TestCase testCase) {
		RequestBody body = this.generateRequestBody(userNumber, sessionNumber, OpenViduRole.PUBLISHER, testCase);
		
		try {
			updateWorkerUrl(sessionNumber, participantsBySession);

			log.info("Selected worker: {}", currentWorkerUrl);
			HttpResponse<String> response = this.httpClient.sendPost(currentWorkerUrl + "/openvidu-browser/streamManager",
					body.toJson(), null, getHeaders());
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

	public boolean createSubscriber(int userNumber, int sessionNumber, int participantsBySession, TestCase testCase) {
		OpenViduRole role = testCase.is_TEACHING() ? OpenViduRole.PUBLISHER : OpenViduRole.SUBSCRIBER;
		RequestBody body = this.generateRequestBody(userNumber, sessionNumber, role, testCase);

		try {
			//TODO: The capacity of sessions with subscribers is not defined
			updateWorkerUrl(sessionNumber, participantsBySession);
			
			log.info("Selected worker: {}", currentWorkerUrl);
			HttpResponse<String> response = this.httpClient.sendPost(currentWorkerUrl + "/openvidu-browser/streamManager",
					body.toJson(), null, getHeaders());
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
		for (String workerUrl : workerUrlList) {
			try {
				log.info("Deleting all participants from worker {}", workerUrl);
				Map<String, String> headers = new HashMap<String, String>();
				headers.put("Content-Type", "application/json");
				this.httpClient.sendDelete(workerUrl + "/openvidu-browser/streamManager", headers);
			} catch (Exception e) {
				if (e.getMessage().equalsIgnoreCase("Connection refused")) {
					log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
					System.exit(1);
				}
				e.printStackTrace();
			}
		}
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

//	public void deleteAllStreamManagers(String role) {
//		
//		if(role.equalsIgnoreCase("PUBLISHER") || role.equalsIgnoreCase("SUBSCRIBER")) {
//			for (String workerUrl : workerUrlList) {
//				try {
//					log.info("Deleting all '{}' from worker {}", role.toUpperCase(), workerUrl);
//					Map<String, String> headers = new HashMap<String, String>();
//					headers.put("Content-Type", "application/json");
//					this.httpClient.sendDelete(workerUrl + "/openvidu-browser/streamManager/role/" + role.toUpperCase(), headers);
//				} catch (IOException | InterruptedException e) {
//					if(e.getMessage().equalsIgnoreCase("Connection refused")) {
//						log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
//					}
//					e.printStackTrace();
//				}
//			}
//		}
//	}

//	public int getCapacity(String typology, int participantsPerSession) {
//		int capacity = 0;
//		try {
//			HttpResponse<String> response = this.httpClient.sendGet(WORKER_URL + "/browser-emulator/capacity?typology=" + typology);
//			JsonObject convertedObject = new Gson().fromJson(response.body().toString(), JsonObject.class);
//			capacity = convertedObject.get("capacity").getAsInt();
//		} catch (IOException | InterruptedException e) {
//			e.printStackTrace();
//		}
//		return capacity;
//	}

	
	private void updateWorkerUrl(int sessionNumber, int participantsBySession) {
		
		String updatePolicy = this.loadTestConfig.getUpdateWorkerUrlPolicy();
		
		if(updatePolicy.equalsIgnoreCase(WorkerUpdatePolicy.CAPACITY.getValue())) {
			// TODO: The capacity number depends of instance resources.
			int mod = -1;
			if(participantsBySession == 2) {
				mod = sessionNumber % 17;
			} else if(participantsBySession == 3) {
				mod = sessionNumber % 12;

			} else if(participantsBySession == 5) {
				mod = sessionNumber % 4;

			} else if(participantsBySession == 8) {
				mod = sessionNumber % 2;
			}
			
			if(mod == 0) {
				int nextIndex = workerUrlList.indexOf(currentWorkerUrl) + 1;
				currentWorkerUrl = workerUrlList.get(nextIndex);
			}
		} else if (updatePolicy.equalsIgnoreCase(WorkerUpdatePolicy.ROUNDROBIN.getValue())) {

			if(workerUrlList.size() > 1) {
				int nextIndex = workerUrlList.indexOf(currentWorkerUrl) + 1;
				if(nextIndex >= workerUrlList.size()) {
					nextIndex = 0;
				}
				currentWorkerUrl = workerUrlList.get(nextIndex);
			}
		}
		
		
		

	}

	private RequestBody generateRequestBody(int userNumber, int sessionNumber, OpenViduRole role, TestCase testCase ) {
		
		boolean video = (testCase.is_TEACHING() && role.equals(OpenViduRole.PUBLISHER)) || !testCase.is_TEACHING() ;
		
		return new RequestBody().openviduUrl(this.loadTestConfig.getOpenViduUrl())
				.openviduSecret(this.loadTestConfig.getOpenViduSecret())
				.browserMode(testCase.getBrowserMode())
				.elasticSearchHost(this.loadTestConfig.getElasticsearchHost())
				.elasticSearchUserName(this.loadTestConfig.getElasticsearchUserName())
				.elasticSearchPassword(this.loadTestConfig.getElasticsearchPassword())
				.userId(this.loadTestConfig.getUserNamePrefix() + userNumber)
				.sessionName(this.loadTestConfig.getSessionNamePrefix() + sessionNumber)
				.audio(true).video(video)
				.role(role)
				.recording(testCase.isRecording())
				.showVideoElements(!testCase.isHeadless())// TODO: new param in testCase.json?
				.headless(testCase.isHeadless())
				.build();

	}

	private Map<String, String> getHeaders() {
		Map<String, String> headers = new HashMap<String, String>();
		headers.put("Content-Type", "application/json");
		return headers;
	}

}
