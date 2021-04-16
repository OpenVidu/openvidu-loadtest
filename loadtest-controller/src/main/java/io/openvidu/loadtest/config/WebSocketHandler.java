package io.openvidu.loadtest.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

public class WebSocketHandler extends TextWebSocketHandler {
	
	private static final Logger log = LoggerFactory.getLogger(WebSocketHandler.class);
	
//	Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
	
	@Override
	public void afterConnectionEstablished(WebSocketSession session) throws Exception {
		log.info("Info websocket stablished...");
//		this.sessions.put(session.getId(), session);
	}
	
	@Override
	public void afterConnectionClosed(WebSocketSession session, CloseStatus close) throws Exception {
		log.info("Info websocket closed: " + close.getReason());
//		this.sessions.remove(session.getId());
		session.close();
	}
	
	@Override
	protected void handleTextMessage(WebSocketSession session, TextMessage message)
			throws Exception {
		log.info("Message received: " + message.getPayload());
	}
	
}
