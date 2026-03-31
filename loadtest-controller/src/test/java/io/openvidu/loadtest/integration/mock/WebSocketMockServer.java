package io.openvidu.loadtest.integration.mock;

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
    private Server server;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final Set<Session> sessions = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final AtomicInteger connectionCount = new AtomicInteger(0);
    private X509Certificate certificate;
    private boolean useHttps = false;

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

        server.start();
        running.set(true);
        useHttps = true;
        log.info("WebSocketMockServer started successfully on HTTPS port {}", port);
    }

    /**
     * Start the mock WebSocket server with plain HTTP.
     */
    public void start() throws Exception {
        log.info("Starting WebSocketMockServer on HTTP port {}", port);

        server = new Server(port);
        setupWebSocketEndpoint();

        server.start();
        running.set(true);
        useHttps = false;
        log.info("WebSocketMockServer started successfully on HTTP port {}", port);
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
     * Send a JSON message to all connected WebSocket clients.
     *
     * @param message the JSON message to send
     */
    public void send(String message) {
        if (!running.get()) {
            log.warn("Cannot send message: server is not running");
            return;
        }

        for (Session session : sessions) {
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
     * Stop the mock WebSocket server.
     */
    public void stop() {
        if (running.compareAndSet(true, false)) {
            log.info("Stopping WebSocketMockServer");
            try {
                sessions.clear();
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
     * Get the number of connections accepted.
     */
    public int getConnectionCount() {
        return connectionCount.get();
    }

    /**
     * Get the number of currently connected clients.
     */
    public int getActiveConnectionCount() {
        return sessions.size();
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
            sessions.add(session);
            int count = connectionCount.incrementAndGet();
            log.info("WebSocket connection #{} established from {}", count, session.getRemoteAddress());
        }

        @OnWebSocketMessage
        public void onMessage(String message) {
            log.debug("Received message: {}", message);
        }
    }

}