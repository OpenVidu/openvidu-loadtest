package io.openvidu.loadtest.integration.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

import org.eclipse.jetty.server.HttpConfiguration;
import org.eclipse.jetty.server.HttpConnectionFactory;
import org.eclipse.jetty.server.SecureRequestCustomizer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.eclipse.jetty.server.SslConnectionFactory;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketConnect;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketMessage;
import org.eclipse.jetty.websocket.api.annotations.WebSocket;
import org.eclipse.jetty.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Mock WebSocket server for browser-emulator events endpoint.
 * Uses Jetty WebSocket server with support for both HTTP and HTTPS.
 */
public class WebSocketMockServer {
    private static final Logger log = LoggerFactory.getLogger(WebSocketMockServer.class);

    private final int port;
    private int actualPort = -1;
    private Server server;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ConcurrentHashMap<Session, String> sessionToWorker = new ConcurrentHashMap<>();
    private final AtomicInteger connectionCount = new AtomicInteger(0);
    private X509Certificate certificate;
    private boolean useHttps = false;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WebSocketMockServer(int port) {
        this.port = port;
    }

    /**
     * Start the mock WebSocket server with HTTPS (self-signed certificate).
     */
    public void startHttps() throws Exception {
        log.info("Starting WebSocketMockServer on HTTPS port {}", port);

        // Generate self-signed certificate
        certificate = SelfSignedCertificateGenerator.generateCertificate();
        KeyStore keyStore = SelfSignedCertificateGenerator.createKeyStore(certificate);

        // Setup SSL context
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, SelfSignedCertificateGenerator.KEY_PASSWORD.toCharArray());

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(kmf.getKeyManagers(), null, new java.security.SecureRandom());

        // Configure Jetty server
        server = new Server();

        // HTTPS configuration
        HttpConfiguration httpsConfig = new HttpConfiguration();
        httpsConfig.setSecureScheme("https");
        httpsConfig.setSecurePort(port);
        httpsConfig.addCustomizer(new SecureRequestCustomizer());

        // SSL context factory
        SslContextFactory.Server sslContextFactory = new SslContextFactory.Server();
        sslContextFactory.setKeyStore(keyStore);
        sslContextFactory.setKeyManagerPassword(SelfSignedCertificateGenerator.KEY_PASSWORD);

        // HTTPS connector
        ServerConnector httpsConnector = new ServerConnector(server,
                new SslConnectionFactory(sslContextFactory, "http/1.1"),
                new HttpConnectionFactory(httpsConfig));
        httpsConnector.setPort(port);
        server.setConnectors(new org.eclipse.jetty.server.Connector[] { httpsConnector });

        // Setup servlet context and WebSocket
        setupWebSocketEndpoint();

        try {
            server.start();
        } catch (java.net.BindException be) {
            log.warn("Port {} already in use when attempting to start WebSocket HTTPS server", port);
            if (isServerResponding(port, true)) {
                log.info("Existing server detected on port {} - reusing it", port);
                running.set(true);
                useHttps = true;
                return;
            }
            throw be;
        }
        running.set(true);
        useHttps = true;
        log.info("WebSocketMockServer started successfully on HTTPS port {}", port);
        // Determine actual bound port (in case port was 0 / ephemeral)
        try {
            org.eclipse.jetty.server.Connector[] connectors = server.getConnectors();
            if (connectors != null && connectors.length > 0) {
                for (org.eclipse.jetty.server.Connector c : connectors) {
                    if (c instanceof ServerConnector sc) {
                        int p = sc.getLocalPort();
                        if (p <= 0) {
                            p = sc.getPort();
                        }
                        this.actualPort = p;
                        break;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not determine WebSocket HTTPS bound port", e);
        }
    }

    /**
     * Start the mock WebSocket server with plain HTTP.
     */
    public void start() throws Exception {
        log.info("Starting WebSocketMockServer on HTTP port {}", port);

        server = new Server(port);
        setupWebSocketEndpoint();

        try {
            server.start();
        } catch (java.net.BindException be) {
            log.warn("Port {} already in use when attempting to start WebSocket HTTP server", port);
            if (isServerResponding(port, false)) {
                log.info("Existing server detected on port {} - reusing it", port);
                running.set(true);
                useHttps = false;
                return;
            }
            throw be;
        }
        running.set(true);
        useHttps = false;
        log.info("WebSocketMockServer started successfully on HTTP port {}", port);
        // Determine actual bound port (in case port was 0 / ephemeral)
        try {
            org.eclipse.jetty.server.Connector[] connectors = server.getConnectors();
            if (connectors != null && connectors.length > 0) {
                for (org.eclipse.jetty.server.Connector c : connectors) {
                    if (c instanceof ServerConnector sc) {
                        int p = sc.getLocalPort();
                        if (p <= 0) {
                            p = sc.getPort();
                        }
                        this.actualPort = p;
                        break;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not determine WebSocket HTTP bound port", e);
        }
    }

    private boolean isServerResponding(int portToCheck, boolean tls) {
        try {
            // First try a lightweight WebSocket handshake to /events
            try {
                String wsScheme = tls ? "wss" : "ws";
                java.net.URI wsUri = new java.net.URI(wsScheme + "://localhost:" + portToCheck + "/events");
                java.net.http.WebSocket.Builder wsBuilder = java.net.http.HttpClient.newBuilder()
                        .connectTimeout(java.time.Duration.ofSeconds(2))
                        .build()
                        .newWebSocketBuilder();

                if (tls) {
                    javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                            new javax.net.ssl.X509TrustManager() {
                                public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                                    return null;
                                }

                                public void checkClientTrusted(java.security.cert.X509Certificate[] certs,
                                        String authType) {
                                }

                                public void checkServerTrusted(java.security.cert.X509Certificate[] certs,
                                        String authType) {
                                }
                            }
                    };
                    javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
                    sc.init(null, trustAllCerts, new java.security.SecureRandom());
                    wsBuilder = java.net.http.HttpClient.newBuilder().sslContext(sc).build().newWebSocketBuilder();
                }

                java.util.concurrent.CompletableFuture<java.net.http.WebSocket> connectFuture = wsBuilder.buildAsync(
                        wsUri,
                        new java.net.http.WebSocket.Listener() {
                        });
                java.net.http.WebSocket webSocket = connectFuture.orTimeout(2, java.util.concurrent.TimeUnit.SECONDS)
                        .join();
                webSocket.abort();
                return true;
            } catch (Throwable wsEx) {
                // Fallback to HTTP GET probe
                String scheme = tls ? "https" : "http";
                java.net.URI uri = new java.net.URI(scheme + "://localhost:" + portToCheck + "/");

                java.net.http.HttpClient client;
                if (tls) {
                    javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                            new javax.net.ssl.X509TrustManager() {
                                public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                                    return null;
                                }

                                public void checkClientTrusted(java.security.cert.X509Certificate[] certs,
                                        String authType) {
                                }

                                public void checkServerTrusted(java.security.cert.X509Certificate[] certs,
                                        String authType) {
                                }
                            }
                    };
                    javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
                    sc.init(null, trustAllCerts, new java.security.SecureRandom());
                    client = java.net.http.HttpClient.newBuilder()
                            .sslContext(sc)
                            .connectTimeout(java.time.Duration.ofSeconds(2))
                            .build();
                } else {
                    client = java.net.http.HttpClient.newBuilder()
                            .connectTimeout(java.time.Duration.ofSeconds(2))
                            .build();
                }

                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                        .uri(uri)
                        .GET()
                        .timeout(java.time.Duration.ofSeconds(2))
                        .build();

                java.net.http.HttpResponse<String> resp = client.send(req,
                        java.net.http.HttpResponse.BodyHandlers.ofString());
                int code = resp.statusCode();
                return code >= 200 && code < 500;
            }
        } catch (Throwable t) {
            return false;
        }
    }

    private void setupWebSocketEndpoint() throws Exception {
        ServletContextHandler context = new ServletContextHandler(ServletContextHandler.SESSIONS);
        context.setContextPath("/");
        server.setHandler(context);

        // Configure WebSocket support for /events endpoint
        JettyWebSocketServletContainerInitializer.configure(context, (servletContext, wsContainer) -> {
            wsContainer.setMaxTextMessageSize(65535);
            wsContainer.setMaxBinaryMessageSize(65535);
            wsContainer.addMapping("/events", (req, resp) -> new EventWebSocketHandler());
        });
    }

    /**
     * Register a worker URL for a WebSocket session.
     * Called when the controller connects to the WebSocket endpoint.
     */
    public void registerWorker(Session session, String workerUrl) {
        sessionToWorker.put(session, workerUrl);
        log.debug("Registered worker {} for session {}", workerUrl, session.getRemoteAddress());
    }

    /**
     * Send a JSON message to all connected WebSocket clients.
     *
     * @param message the JSON message to send
     */
    public void send(String message) {
        if (!running.get()) {
            log.warn("Cannot send message: server is not running");
            return;
        }

        for (Session session : sessionToWorker.keySet()) {
            if (session.isOpen()) {
                try {
                    session.getRemote().sendString(message);
                    log.debug("Message sent: {}", message);
                } catch (IOException e) {
                    log.error("Error sending WebSocket message", e);
                }
            }
        }
    }

    /**
     * Send a "sessionDisconnected" event for a specific participant to trigger
     * reconnection.
     * The message format matches what WebSocketClient.onMessage() expects to
     * trigger handleError().
     * Sends to only the first connected session to avoid duplicate processing
     * across multiple workers.
     */
    public void sendDisconnected(String participant, String session) {
        if (!running.get()) {
            log.warn("Cannot send disconnected event: server is not running");
            return;
        }

        try {
            ObjectNode event = objectMapper.createObjectNode();
            event.put("type", "sessionDisconnected");
            event.put("participant", participant);
            event.put("session", session);
            event.put("timestamp", System.currentTimeMillis());

            String eventJson = objectMapper.writeValueAsString(event);

            // Send to only ONE WebSocket session to avoid duplicate processing
            for (Session wsSession : sessionToWorker.keySet()) {
                if (wsSession.isOpen()) {
                    wsSession.getRemote().sendString(eventJson);
                    log.info("Sent sessionDisconnected event for {} in {} to one worker", participant, session);
                    return;
                }
            }
            log.warn("No open WebSocket sessions to send disconnect event for {} in {}", participant, session);
        } catch (Exception e) {
            log.error("Failed to send sessionDisconnected event for {} in {}", participant, session, e);
        }
    }

    /**
     * Stop the mock WebSocket server.
     */
    public void stop() {
        if (running.compareAndSet(true, false)) {
            log.info("Stopping WebSocketMockServer");
            try {
                sessionToWorker.clear();
                if (server != null) {
                    server.stop();
                }
                log.info("WebSocketMockServer stopped");
            } catch (Exception e) {
                log.error("Error stopping WebSocketMockServer", e);
            }
        }
    }

    /**
     * Check if server is running.
     */
    public boolean isRunning() {
        return running.get();
    }

    /**
     * Get the port the server is running on (actual bound port if ephemeral
     * chosen).
     */
    public int getPort() {
        return actualPort != -1 ? actualPort : port;
    }

    /**
     * Get the number of connections accepted.
     */
    public int getConnectionCount() {
        return connectionCount.get();
    }

    /**
     * Get the number of currently connected clients.
     */
    public int getActiveConnectionCount() {
        return sessionToWorker.size();
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
     * WebSocket handler for the /events endpoint.
     * Tracks connections and logs incoming messages.
     */
    @WebSocket
    public class EventWebSocketHandler {

        @OnWebSocketConnect
        public void onConnect(Session session) {
            sessionToWorker.put(session, "unknown");
            int count = connectionCount.incrementAndGet();
            log.info("WebSocket connection #{} established from {}", count, session.getRemoteAddress());
        }

        @OnWebSocketMessage
        public void onMessage(String message) {
            log.debug("Received message: {}", message);
        }
    }

}