package io.openvidu.loadtest.infrastructure;

import java.io.IOException;
import java.net.http.HttpResponse;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import io.openvidu.loadtest.utils.CustomHttpClient;

public class BrowserEmulatorClient {
	
	private CustomHttpClient httpClient;
	private static final String WORKER_URL = "http://localhost:5000";

	public BrowserEmulatorClient() {
		this.httpClient = new CustomHttpClient();
	}

	
	public String createPublisher(String userId, String sessionName, boolean audio, boolean video) {
		JsonObject jsonBody = new JsonObject();
		JsonObject properties = new JsonObject();
		jsonBody.addProperty("userId", userId);
		jsonBody.addProperty("sessionName", sessionName);
		properties.addProperty("role", "PUBLISHER");
		properties.addProperty("audio", audio);
		properties.addProperty("video", video);
		jsonBody.add("properties", properties);
		try {
			HttpResponse<String> response = this.httpClient.sendPost(WORKER_URL + "/openvidu-browser/streamManager", jsonBody);
			if(response.statusCode() == 500) {
				System.out.println("ERROR EN WORKER");
				// worker "overloaded". Change worker instance
			}
		} catch (IOException | InterruptedException e) {
			e.printStackTrace();
		}

		return "";
	}
	
	public String createSubscriber(String userId, String sessionName) {
		
		JsonObject jsonBody = new JsonObject();
		JsonObject properties = new JsonObject();
		jsonBody.addProperty("userId", userId);
		jsonBody.addProperty("sessionName", sessionName);
		properties.addProperty("role", "SUBSCRIBER");
		jsonBody.add("properties", new JsonObject());
		try {
			this.httpClient.sendPost(WORKER_URL + "/openvidu-browser/streamManager", jsonBody);
		} catch (IOException | InterruptedException e) {
			e.printStackTrace();
		}

		return "";
	}
	
	public int getCapacity(String typology, int participantsPerSession) {
		int capacity = 0;
		try {
			HttpResponse<String> response = this.httpClient.sendGet(WORKER_URL + "/browser-emulator/capacity?typology=" + typology);
			JsonObject convertedObject = new Gson().fromJson(response.body().toString(), JsonObject.class);
			capacity = convertedObject.get("capacity").getAsInt();
		} catch (IOException | InterruptedException e) {
			e.printStackTrace();
		}
		return capacity;
	}
	
	


}
