package io.openvidu.loadtest.infrastructure;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import javax.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

import io.openvidu.loadtest.config.LoadTestConfig;
import io.openvidu.loadtest.models.testcase.RequestBody;
import io.openvidu.loadtest.utils.CustomHttpClient;

@Service
public class BrowserEmulatorClient {
	
	private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorClient.class);
	
	private static List<String> workerUrlList = new ArrayList<String>();
	private static AtomicInteger lastWorkerIndex = new AtomicInteger(-1);
	
	
	@Autowired
	private LoadTestConfig loadTestConfig;
	
	@Autowired
	private CustomHttpClient httpClient;

	
	@PostConstruct
	public void init() {
		workerUrlList = this.loadTestConfig.getWorkerUrlList();
	}
	
	public HttpResponse<String> createPublisher(RequestBody body) {
		String workerUrl = "";

		try {
			workerUrl = getNextWorkerUrl();
			log.info("Worker selected address: {}", workerUrl);
			log.info("Connecting user: '{}' into session: '{}'", body.getUserId(), body.getSessionName());
			Map<String, String> headers = new HashMap<String, String>();
			headers.put("Content-Type", "application/json");
			return this.httpClient.sendPost(workerUrl + "/openvidu-browser/streamManager", body.toJson(), null, headers);
		} catch (IOException | InterruptedException e) {
			if(e.getMessage().equalsIgnoreCase("Connection refused")) {
				log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
				System.exit(1);
			}
			e.printStackTrace();
		}
		return null;
	}
	
	public void deleteAllStreamManagers(String role) {
		
		if(role.equalsIgnoreCase("PUBLISHER") || role.equalsIgnoreCase("SUBSCRIBER")) {
			for (String workerUrl : workerUrlList) {
				try {
					log.info("Deleting all '{}' from worker {}", role.toUpperCase(), workerUrl);
					Map<String, String> headers = new HashMap<String, String>();
					headers.put("Content-Type", "application/json");
					this.httpClient.sendDelete(workerUrl + "/openvidu-browser/streamManager/role/" + role.toUpperCase(), headers);
				} catch (IOException | InterruptedException e) {
					if(e.getMessage().equalsIgnoreCase("Connection refused")) {
						log.error("Error trying connect with worker on {}: {}", workerUrl, e.getMessage());
					}
					e.printStackTrace();
				}
			}
		}
	}
	
//	public String createSubscriber(String userId, String sessionName) {
//		
//		JsonObject jsonBody = new JsonObject();
//		JsonObject properties = new JsonObject();
//		jsonBody.addProperty("userId", userId);
//		jsonBody.addProperty("sessionName", sessionName);
//		properties.addProperty("role", "SUBSCRIBER");
//		jsonBody.add("properties", new JsonObject());
//		try {
//			this.httpClient.sendPost(getWorkerUrl() + "/openvidu-browser/streamManager", jsonBody);
//		} catch (IOException | InterruptedException e) {
//			e.printStackTrace();
//		}
//
//		return "";
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
	
	private String getNextWorkerUrl() {
		int workerInstances = workerUrlList.size();
		int nextWorkerIndex = lastWorkerIndex.incrementAndGet();
		
		if(nextWorkerIndex > workerInstances - 1) {
			lastWorkerIndex.set(0); 
			return workerUrlList.get(0);
		}
		return workerUrlList.get(nextWorkerIndex);
		
	}


}
