package io.openvidu.loadtest.services;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

import javax.websocket.ClientEndpoint;
import javax.websocket.CloseReason;
import javax.websocket.CloseReason.CloseCodes;
import javax.websocket.Endpoint;
import javax.websocket.EndpointConfig;
import javax.websocket.OnClose;
import javax.websocket.OnMessage;
import javax.websocket.OnOpen;
import javax.websocket.Session;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@ClientEndpoint
public class WebSocketClient extends Endpoint {
	private final Logger log = LoggerFactory.getLogger(WebSocketClient.class);

	private AtomicInteger attempts = new AtomicInteger(1);

	private Session session;

	private String wsEndpoint;
	private final int RETRY_TIME_MS = 4000;
	private final int MAX_ATTEMPT = 5;
	private AtomicInteger attemptsClose = new AtomicInteger(1);

	private WebSocketConnectionFactory factoryCreator;

	public WebSocketClient(String endpointURI, WebSocketConnectionFactory factory) {
		this.wsEndpoint = endpointURI;
		this.factoryCreator = factory;
	}

	public void setSession(Session session) {
		this.session = session;
	}

	public String getEndpoint() {
		return this.wsEndpoint;
	}

	@OnClose
	public void onClose(Session session, CloseReason reason) {
		log.info("closing websocket {}", session.getRequestURI());
		if(reason.getCloseCode().equals(CloseCodes.CLOSED_ABNORMALLY)) {
			log.error("Websocket {} closed abnormally", getEndpoint());
			log.error("Reconnecting ...");
			attempts.set(1);
			factoryCreator.createConnection(wsEndpoint, this);
		} 
	}
	
	 @Override
     public void onError(Session session, Throwable thr) {
         super.onError(session, thr);
         log.error("Error {}", thr.getMessage());
         thr.printStackTrace();
     }

	@OnOpen
	public void onOpen(Session session, EndpointConfig config) {
		log.info("Websocket connected");
	}

	@OnMessage
	public void onMessage(String message) {
		if(message.contains("exception") || message.contains("Exception")) {
			log.error("Received exception from {}: {}", this.wsEndpoint, message);
			WorkerExceptionManager.getInstance().setException(message);
		}
	}

	public void close() {
		if ((session != null) && (session.isOpen())) {
			try {
				log.info("Closing websocket session: {}", wsEndpoint);
				session.close(new CloseReason(CloseCodes.NORMAL_CLOSURE, "Closing session"));
			} catch (IOException e) {
				log.error(e.getMessage());
				log.info("Retrying ...");
				try {
					Thread.sleep(RETRY_TIME_MS);
				} catch (InterruptedException e1) {
					e1.printStackTrace();
				}
				if(attemptsClose.getAndIncrement() < MAX_ATTEMPT) {
					this.close();
				} else {
					attemptsClose.set(1);
					log.error("Could not close websocket connection");
				}
			}
		}
	}

}
