package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import jakarta.websocket.ContainerProvider;
import jakarta.websocket.DeploymentException;
import jakarta.websocket.Session;
import jakarta.websocket.WebSocketContainer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class WebSocketConnectionFactory {
    private static final Logger log = LoggerFactory.getLogger(WebSocketConnectionFactory.class);

    private WebSocketContainer wsClient = ContainerProvider.getWebSocketContainer();
    private static final int RETRY_TIME_S = 4;
    private static final int MAX_ATTEMPT = 5;

    private Sleeper sleeper;
    private BrowserEmulatorClient beInstance;

    public WebSocketConnectionFactory(Sleeper sleeper, BrowserEmulatorClient beInstance) {
        this.sleeper = sleeper;
        this.beInstance = beInstance;
    }

    public WebSocketClient createConnection(String endpointURI) {
        WebSocketClient wsc = new WebSocketClient(endpointURI, this, this.beInstance, this.sleeper);
        for (int attempt = 1; attempt <= MAX_ATTEMPT; attempt++) {
            try {
                Session session = wsClient.connectToServer(wsc, new URI(endpointURI));
                wsc.setSession(session);
                return wsc;
            } catch (DeploymentException | IOException e) {
                log.error("WebSocket connect error to {} (attempt {}/{})", endpointURI, attempt, MAX_ATTEMPT, e);
                if (attempt < MAX_ATTEMPT) {
                    sleeper.sleep(RETRY_TIME_S, "error on websocket connection, retrying");
                    continue;
                }
                log.error("Could not (re)connect to {} endpoint", endpointURI);
                return null;
            } catch (URISyntaxException e1) {
                e1.printStackTrace();
                System.exit(1);
            }
        }
        return null;
    }

    public WebSocketClient createConnection(String endpointURI, WebSocketClient wsc) {
        for (int attempt = 1; attempt <= MAX_ATTEMPT; attempt++) {
            try {
                Session session = wsClient.connectToServer(wsc, new URI(endpointURI));
                wsc.setSession(session);
                return wsc;
            } catch (DeploymentException | IOException e) {
                log.error("WebSocket connect error to {} (attempt {}/{})", endpointURI, attempt, MAX_ATTEMPT, e);
                if (attempt < MAX_ATTEMPT) {
                    sleeper.sleep(RETRY_TIME_S, "error on websocket connection, retrying");
                    continue;
                }
                log.error("Could not (re)connect to {} endpoint", endpointURI);
                return null;
            } catch (URISyntaxException e1) {
                e1.printStackTrace();
                System.exit(1);
            }
        }
        return null;
    }
}
