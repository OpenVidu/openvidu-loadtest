package io.openvidu.loadtest.integration.mock;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpsServer;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsParameters;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManagerFactory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Mock server for browser-emulator HTTP/HTTPS API using Java's built-in
 * HttpServer/HttpsServer.
 * Simulates the browser-emulator endpoints that loadtest-controller
 * communicates with. Can be configured for HTTP or HTTPS with self-signed
 * certificate.
 */
public class BrowserEmulatorMockServer {
    private static final Logger log = LoggerFactory.getLogger(BrowserEmulatorMockServer.class);

    private HttpServer httpServer;
    private HttpsServer httpsServer;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Random random = new Random();
    private final AtomicInteger requestCount = new AtomicInteger(0);
    private X509Certificate certificate;
    private final int port;
    private boolean useHttps = false;
    private WebSocketMockServer webSocketServer;

    public BrowserEmulatorMockServer(int port) {
        this.port = port;
        log.info("BrowserEmulatorMockServer created for port {}", port);
    }

    /**
     * Set the WebSocket server to send events to when participants are created.
     */
    public void setWebSocketServer(WebSocketMockServer webSocketServer) {
        this.webSocketServer = webSocketServer;
    }

    /**
     * Start the mock HTTPS server with self-signed certificate.
     */
    public void startHttps() throws Exception {
        log.info("Starting BrowserEmulatorMockServer on HTTPS port {}", port);

        // Generate self-signed certificate
        certificate = SelfSignedCertificateGenerator.generateCertificate();
        KeyStore keyStore = SelfSignedCertificateGenerator.createKeyStore(certificate);

        // Setup SSL context
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, SelfSignedCertificateGenerator.KEY_PASSWORD.toCharArray());

        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(keyStore);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(kmf.getKeyManagers(), tmf.getTrustManagers(), null);

        // Create HTTPS server
        this.httpsServer = HttpsServer.create(new InetSocketAddress(port), 0);
        this.httpsServer.setHttpsConfigurator(new HttpsConfigurator(sslContext) {
            @Override
            public void configure(HttpsParameters params) {
                SSLContext context = getSSLContext();
                SSLEngine engine = context.createSSLEngine();
                params.setNeedClientAuth(false);
                params.setCipherSuites(engine.getEnabledCipherSuites());
                params.setProtocols(engine.getEnabledProtocols());
                params.setSSLParameters(context.getDefaultSSLParameters());
            }
        });
        this.httpsServer.setExecutor(Executors.newCachedThreadPool());

        // Register handlers
        registerHandlers(httpsServer);

        // Start the server
        httpsServer.start();
        useHttps = true;
        log.info("BrowserEmulatorMockServer started successfully on HTTPS port {}", port);
    }

    /**
     * Start the mock HTTP server (plain, no encryption).
     */
    public void start() throws IOException {
        log.info("Starting BrowserEmulatorMockServer on HTTP port {}", port);

        // Create HTTP server
        this.httpServer = HttpServer.create(new InetSocketAddress(port), 0);
        this.httpServer.setExecutor(Executors.newCachedThreadPool());

        // Register handlers
        registerHandlers(httpServer);

        // Start the server
        httpServer.start();
        useHttps = false;
        log.info("BrowserEmulatorMockServer started successfully on HTTP port {}", port);
    }

    private void registerHandlers(HttpServer server) {
        server.createContext("/instance/ping", new PingHandler());
        server.createContext("/instance/initialize", new InitializeHandler());
        server.createContext("/openvidu-browser/streamManager", new StreamManagerHandler());
        server.createContext("/instance/shutdown", new ShutdownHandler());
    }

    private void registerHandlers(HttpsServer server) {
        server.createContext("/instance/ping", new PingHandler());
        server.createContext("/instance/initialize", new InitializeHandler());
        server.createContext("/openvidu-browser/streamManager", new StreamManagerHandler());
        server.createContext("/instance/shutdown", new ShutdownHandler());
    }

    /**
     * Stop the mock server.
     */
    public void stop() {
        log.info("Stopping BrowserEmulatorMockServer");
        if (httpsServer != null) {
            httpsServer.stop(0);
        }
        if (httpServer != null) {
            httpServer.stop(0);
        }
    }

    /**
     * Check if server is running.
     */
    public boolean isRunning() {
        return (httpServer != null) || (httpsServer != null);
    }

    /**
     * Get the port the server is running on.
     */
    public int getPort() {
        return port;
    }

    /**
     * Get the self-signed certificate (for clients to trust).
     */
    public X509Certificate getCertificate() {
        return certificate;
    }

    /**
     * Check if server is using HTTPS.
     */
    public boolean isHttps() {
        return useHttps;
    }

    /**
     * Reset request count (useful for test isolation).
     */
    public void resetRequestCount() {
        this.requestCount.set(0);
    }

    /**
     * Get the total number of requests processed.
     */
    public int getRequestCount() {
        return requestCount.get();
    }

    /**
     * Handler for GET /instance/ping endpoint.
     */
    private class PingHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            requestCount.incrementAndGet();
            log.debug("Received GET /instance/ping request #{}", requestCount);

            String response = "Pong";
            exchange.getResponseHeaders().set("Content-Type", "text/plain");
            exchange.sendResponseHeaders(200, response.length());

            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        }
    }

    /**
     * Handler for POST /instance/initialize endpoint.
     */
    private class InitializeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            requestCount.incrementAndGet();
            log.debug("Received POST /instance/initialize request #{}", requestCount);

            String response = "Instance initialized successfully";
            exchange.getResponseHeaders().set("Content-Type", "text/plain");
            exchange.sendResponseHeaders(200, response.length());

            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        }
    }

    /**
     * Handler for POST /openvidu-browser/streamManager endpoint.
     * This endpoint creates a new participant (publisher or subscriber).
     * Also sends a ParticipantCreated event via WebSocket to notify the controller.
     */
    private class StreamManagerHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("POST".equals(exchange.getRequestMethod())) {
                requestCount.incrementAndGet();
                log.debug("Received POST /openvidu-browser/streamManager request #{}", requestCount);

                try {
                    // Read request body
                    int length = exchange.getRequestBody().available();
                    byte[] input = new byte[length];
                    exchange.getRequestBody().read(input);
                    String requestBody = new String(input);

                    // Parse JSON to extract userId and sessionName
                    ObjectNode requestJson = (ObjectNode) objectMapper.readTree(requestBody);
                    String userId = requestJson.path("properties").path("userId").asText("unknown");
                    String sessionName = requestJson.path("properties").path("sessionName").asText("unknown");
                    String role = requestJson.path("properties").path("role").asText("SUBSCRIBER");

                    // Calculate streams and participants based on role
                    int streams = "PUBLISHER".equals(role) ? 2 : 1;
                    int participants = 1;

                    // Generate response
                    ObjectNode responseJson = objectMapper.createObjectNode();
                    responseJson.put("connectionId", "conn-" + userId + "-" + sessionName + "-" + requestCount);
                    responseJson.put("streams", streams);
                    responseJson.put("participants", participants);
                    responseJson.put("workerCpuUsage", 0.1 + random.nextDouble() * 0.6); // 0.1-0.7
                    responseJson.put("userId", userId);
                    responseJson.put("sessionId", sessionName);

                    String response = responseJson.toString();
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, response.length());

                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(response.getBytes());
                    }

                    // Send ParticipantCreated event via WebSocket if connected
                    // This mimics the real browser-emulator behavior
                    sendParticipantCreatedEvent(userId, sessionName);

                    // Small delay to ensure unique timestamps for multiple users
                    try {
                        Thread.sleep(10);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }

                } catch (Exception e) {
                    log.error("Error processing streamManager request", e);
                    String errorResponse = "{\"error\": \"Internal server error\"}";
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(500, errorResponse.length());

                    try (OutputStream os = exchange.getResponseBody()) {
                        os.write(errorResponse.getBytes());
                    }
                }
            } else {
                // Handle unexpected methods
                exchange.sendResponseHeaders(405, -1); // Method Not Allowed
                exchange.getResponseBody().close();
            }
        }

        /**
         * Send a ParticipantCreated event via WebSocket to notify the controller.
         * This mimics what the real browser-emulator does when a participant joins.
         */
        private void sendParticipantCreatedEvent(String userId, String sessionName) {
            if (webSocketServer != null && webSocketServer.isRunning()) {
                try {
                    ObjectNode event = objectMapper.createObjectNode();
                    event.put("type", "ParticipantCreated");
                    event.put("participant", userId);
                    event.put("session", sessionName);
                    event.put("timestamp", System.currentTimeMillis());

                    String eventJson = objectMapper.writeValueAsString(event);
                    webSocketServer.send(eventJson);
                    log.debug("Sent ParticipantCreated event for {} in {}", userId, sessionName);
                } catch (Exception e) {
                    log.warn("Failed to send WebSocket event: {}", e.getMessage());
                }
            }
        }
    }

    /**
     * Handler for DELETE /instance/shutdown endpoint.
     */
    private class ShutdownHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            requestCount.incrementAndGet();
            log.debug("Received DELETE /instance/shutdown request #{}", requestCount);

            String response = "Shutdown initiated";
            exchange.getResponseHeaders().set("Content-Type", "text/plain");
            exchange.sendResponseHeaders(200, response.length());

            try (OutputStream os = exchange.getResponseBody()) {
                os.write(response.getBytes());
            }
        }
    }
}
