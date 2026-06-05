package io.openvidu.loadtest.unit.services;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import io.openvidu.loadtest.services.BrowserEmulatorClient;
import io.openvidu.loadtest.services.Sleeper;
import io.openvidu.loadtest.services.WebSocketClient;
import io.openvidu.loadtest.services.WebSocketConnectionFactory;

class WebSocketClientTests {

    private static final String WS_ENDPOINT = "ws://worker.example.com:5000/events";

    private WebSocketClient webSocketClient;
    private BrowserEmulatorClient browserEmulatorClient;

    @BeforeEach
    void setUp() {
        WebSocketConnectionFactory factory = mock(WebSocketConnectionFactory.class);
        this.browserEmulatorClient = mock(BrowserEmulatorClient.class);
        Sleeper sleeper = mock(Sleeper.class);

        when(this.browserEmulatorClient.getLastErrorReconnectingResponse()).thenReturn(null);

        this.webSocketClient = new WebSocketClient(
                WS_ENDPOINT,
                factory,
                this.browserEmulatorClient,
                sleeper);
    }

    @Test
    void onMessageHealthErrorShouldTriggerClientFailure() {
        String message = "{" +
                "\"event\":\"EMULATED_PARTICIPANT_HEALTH_ERROR\"," +
                "\"participant\":\"User1\"," +
                "\"session\":\"SessionA\"" +
                "}";

        this.webSocketClient.onMessage(message);

        verify(this.browserEmulatorClient).addClientFailure(
                eq("worker.example.com"),
                eq("User1"),
                eq("SessionA"),
                eq(true));
    }

    @Test
    void onMessageParticipantDisconnectedShouldNotTriggerClientFailure() {
        String message = "{" +
                "\"event\":\"ParticipantDisconnected\"," +
                "\"participant\":\"User1\"," +
                "\"session\":\"SessionA\"" +
                "}";

        this.webSocketClient.onMessage(message);

        verify(this.browserEmulatorClient, never()).addClientFailure(
                eq("worker.example.com"),
                eq("User1"),
                eq("SessionA"),
                eq(true));
    }

    @Test
    void onMessageGenericErrorShouldNotTriggerClientFailure() {
        String message = "{" +
                "\"event\":\"Warning\"," +
                "\"error\":\"temporary issue\"," +
                "\"participant\":\"User1\"," +
                "\"session\":\"SessionA\"" +
                "}";

        this.webSocketClient.onMessage(message);

        verify(this.browserEmulatorClient, never()).addClientFailure(
                eq("worker.example.com"),
                eq("User1"),
                eq("SessionA"),
                eq(true));
    }
}
