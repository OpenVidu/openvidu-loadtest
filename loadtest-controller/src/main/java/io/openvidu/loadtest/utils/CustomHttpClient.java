package io.openvidu.loadtest.utils;

import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.net.ConnectException;
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
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;
import java.util.Properties;
import java.util.Random;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import org.springframework.stereotype.Service;

import com.google.gson.JsonObject;

@Service
public class CustomHttpClient {

	private HttpClient client;

	public CustomHttpClient() {
		
		try {
			this.client = this.createClientAllowingInsecureCert();
		} catch (KeyManagementException | NoSuchAlgorithmException e) {
			System.out.println("Error creating httpClient allowing insecure cert. Creating a secured one");
			this.client = HttpClient.newBuilder().build();
		}
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

		HttpRequest request = requestBuilder.POST(postBody).timeout(Duration.ofSeconds(60)).build();
		return client.send(request, HttpResponse.BodyHandlers.ofString());
	}

	public HttpResponse<String> sendGet(String url, Map<String, String> headers) throws IOException, InterruptedException {

		Builder requestBuilder = HttpRequest.newBuilder().uri(URI.create(url));
				
		headers.forEach((k, v) -> {
			requestBuilder.header(k, v);
		});
				
		HttpRequest request = requestBuilder.GET().build();
		return client.send(request, HttpResponse.BodyHandlers.ofString());
	}

	public HttpResponse<String> sendDelete(String url, Map<String, String> headers) throws IOException, InterruptedException, ConnectException {
		Builder requestBuilder = HttpRequest.newBuilder().uri(URI.create(url));
		headers.forEach((k, v) -> {
			requestBuilder.header(k, v);
		});
		HttpRequest request = requestBuilder.DELETE().build();
		return client.send(request, HttpResponse.BodyHandlers.ofString());
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
	
	private HttpClient createClientAllowingInsecureCert() throws NoSuchAlgorithmException, KeyManagementException {
		final Properties props = System.getProperties(); 
		props.setProperty("jdk.internal.httpclient.disableHostnameVerification", Boolean.TRUE.toString());
		props.setProperty("jdk.httpclient.allowRestrictedHeaders", Boolean.TRUE.toString());
		props.setProperty("jdk.httpclient.keepalive.timeout", "0");


		// Create a trust manager that does not validate certificate chains
		TrustManager[] trustAllCerts = new TrustManager[]{
		    new X509TrustManager() {
		        public java.security.cert.X509Certificate[] getAcceptedIssuers() {
		            return null;
		        }
		        public void checkClientTrusted(
		            java.security.cert.X509Certificate[] certs, String authType) {
		        }
		        public void checkServerTrusted(
		            java.security.cert.X509Certificate[] certs, String authType) {
		        }
		    }
		};
		
		// Install the all-trusting trust manager
		SSLContext sc = SSLContext.getInstance("SSL");
	    sc.init(null, trustAllCerts, new java.security.SecureRandom());
	    HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
		return HttpClient.newBuilder().sslContext(sc).build();
	}

}
