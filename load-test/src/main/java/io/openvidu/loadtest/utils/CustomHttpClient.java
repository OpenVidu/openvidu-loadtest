package io.openvidu.loadtest.utils;

import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublisher;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpRequest.Builder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Map;
import java.util.Random;

import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

@Service
public class CustomHttpClient {

	private HttpClient client;

	public CustomHttpClient() {
		this.client = HttpClient.newHttpClient();
	}

	public HttpResponse<String> sendPost(String url, JsonObject body, File file, Map<String, String> headers)
			throws IOException, InterruptedException {

		String boundary = "";
		Builder requestBuilder = HttpRequest.newBuilder().uri(URI.create(url));
		BodyPublisher postBody;

		headers.forEach((k, v) -> {
			requestBuilder.header(k, v);
		});

		if (file != null) {
			boundary = new BigInteger(256, new Random()).toString();
			requestBuilder.header("Content-Type", "multipart/form-data;boundary=" + boundary);
			postBody = ofMimeMultipartData(Map.of("file", file.toPath()), boundary);
		} else {
			requestBuilder.header("Content-Type", "application/json");
			postBody = HttpRequest.BodyPublishers.ofString(body.toString());
		}

		HttpRequest request = requestBuilder.POST(postBody).build();
		return client.send(request, HttpResponse.BodyHandlers.ofString());
	}

	public HttpResponse<String> sendGet(String url) throws IOException, InterruptedException {

		HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
		HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
		return response;
	}

	public HttpResponse<String> sendDelete(String url) throws IOException, InterruptedException {
		HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).DELETE().build();
		HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
		return response;
	}

	private BodyPublisher ofMimeMultipartData(Map<Object, Object> data, String boundary) throws IOException {
		var byteArrays = new ArrayList<byte[]>();
		byte[] separator = ("--" + boundary + "\r\nContent-Disposition: form-data; name=")
				.getBytes(StandardCharsets.UTF_8);
		for (Map.Entry<Object, Object> entry : data.entrySet()) {
			byteArrays.add(separator);

			if (entry.getValue() instanceof Path) {
				var path = (Path) entry.getValue();
				String mimeType = Files.probeContentType(path);
				byteArrays.add(("\"" + entry.getKey() + "\"; filename=\"" + path.getFileName() + "\"\r\nContent-Type: "
						+ mimeType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
				byteArrays.add(Files.readAllBytes(path));
				byteArrays.add("\r\n".getBytes(StandardCharsets.UTF_8));
			} else {
				byteArrays.add(("\"" + entry.getKey() + "\"\r\n\r\n" + entry.getValue() + "\r\n")
						.getBytes(StandardCharsets.UTF_8));
			}
		}
		byteArrays.add(("--" + boundary + "--").getBytes(StandardCharsets.UTF_8));
		return BodyPublishers.ofByteArrays(byteArrays);
	}

}
