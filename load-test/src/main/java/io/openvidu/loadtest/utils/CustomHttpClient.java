package io.openvidu.loadtest.utils;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

@Service
public class CustomHttpClient {

	private HttpClient client;

	public CustomHttpClient() {
		this.client = HttpClient.newHttpClient();
	}

	public HttpResponse<String> sendPost(String url, JsonObject body) throws IOException, InterruptedException {

		HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();

		HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
		return response;
	}

	public HttpResponse<String> sendGet(String url) throws IOException, InterruptedException {

		HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
		HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
		return response;
	}


}
