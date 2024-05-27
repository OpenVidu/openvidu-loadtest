package io.openvidu.loadtest.services;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.concurrent.atomic.AtomicInteger;

import javax.websocket.ContainerProvider;
import javax.websocket.DeploymentException;
import javax.websocket.Session;
import javax.websocket.WebSocketContainer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class WebSocketConnectionFactory {
	private static final Logger log = LoggerFactory.getLogger(WebSocketClient.class);

	private WebSocketContainer wsClient = ContainerProvider.getWebSocketContainer();
	private static final int RETRY_TIME_S = 4;
	private static final int MAX_ATTEMPT = 5;
	private AtomicInteger attempts = new AtomicInteger(1);

	private Sleeper sleeper;

	@Autowired
	private BrowserEmulatorClient beInstance;
	
	public WebSocketClient createConnection(String endpointURI) {
        WebSocketClient wsc = new WebSocketClient(endpointURI, this, this.beInstance, this.sleeper);
		try {
			Session session = wsClient.connectToServer(wsc, new URI(endpointURI));
			wsc.setSession(session);
		} catch (DeploymentException | IOException e) {
			return retryOnError(e, endpointURI);
		} catch (URISyntaxException e1) {
			e1.printStackTrace();
			System.exit(1);
		}
        return wsc;
	}

	public WebSocketClient createConnection(String endpointURI, WebSocketClient wsc) {
		try {
			Session session = wsClient.connectToServer(wsc, new URI(endpointURI));
			wsc.setSession(session);
		} catch (DeploymentException | IOException e) {
			return retryOnError(e, endpointURI);
		} catch (URISyntaxException e1) {
			e1.printStackTrace();
			System.exit(1);
		}
        return wsc;
	}

	private WebSocketClient retryOnError(Exception e, String endpointURI) {
		log.error(e.getMessage());
		log.info("Retrying ...");
		sleeper.sleep(RETRY_TIME_S, "error con websocket connection, retrying");
		if(attempts.getAndIncrement() < MAX_ATTEMPT) {
			return createConnection(endpointURI);
		} else {
			attempts.set(1);
			log.error("Could not (re)connect to {} endpoint", endpointURI);
			return null;
		}
	}
}
