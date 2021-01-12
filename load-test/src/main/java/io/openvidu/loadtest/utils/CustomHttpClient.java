package io.openvidu.loadtest.utils;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import com.google.gson.JsonObject;

public class CustomHttpClient {

	private static final String WORKER_URL = "http://localhost:5000";

	public void createPublisher(String userId, String sessionName, boolean audio, boolean video) {

		JsonObject jsonBody = new JsonObject();
		JsonObject properties = new JsonObject();
		jsonBody.addProperty("userId", userId);
		jsonBody.addProperty("sessionName", sessionName);
		properties.addProperty("role", "PUBLISHER");
		properties.addProperty("audio", audio);
		properties.addProperty("video", video);
		jsonBody.add("properties", properties);

		HttpClient client = HttpClient.newHttpClient();
		HttpRequest request = HttpRequest.newBuilder().uri(URI.create(WORKER_URL + "/openvidu-browser/streamManager"))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(jsonBody.toString())).build();

		HttpResponse<String> response;
		try {
			response = client.send(request, HttpResponse.BodyHandlers.ofString());
			System.out.println(response.body());

		} catch (IOException | InterruptedException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}

	}

	public void createSubscriber(String userId, String sessionName) {
		JsonObject jsonBody = new JsonObject();
		JsonObject properties = new JsonObject();
		jsonBody.addProperty("userId", userId);
		jsonBody.addProperty("sessionName", sessionName);
		properties.addProperty("role", "SUBSCRIBER");
		jsonBody.add("properties", new JsonObject());

		HttpClient client = HttpClient.newHttpClient();
		HttpRequest request = HttpRequest.newBuilder().uri(URI.create(WORKER_URL + "/openvidu-browser/streamManager"))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(jsonBody.toString())).build();

		HttpResponse<String> response;
		try {
			response = client.send(request, HttpResponse.BodyHandlers.ofString());
			System.out.println(response.body());

		} catch (IOException | InterruptedException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}

}
