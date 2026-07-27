package com.hamcheeze.chat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class TimeToFirstMessageIntegrationTest {

    @LocalServerPort
    private int port;

    @Test
    void localRuntimeIsLiveAndReady() throws Exception {
        HttpClient client = HttpClient.newHttpClient();

        HttpResponse<String> liveness = client.send(
                HttpRequest.newBuilder(URI.create(
                                "http://localhost:" + port
                                        + "/actuator/health/liveness"))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        HttpResponse<String> readiness = client.send(
                HttpRequest.newBuilder(URI.create(
                                "http://localhost:" + port
                                        + "/actuator/health/readiness"))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(liveness.statusCode()).isEqualTo(200);
        assertThat(liveness.body()).contains("\"status\":\"UP\"");
        assertThat(readiness.statusCode()).isEqualTo(200);
        assertThat(readiness.body()).contains("\"status\":\"UP\"");
    }

    @Test
    void closesTransportWhenNoFirstStompMessageArrives() throws Exception {
        CountDownLatch closed = new CountDownLatch(1);
        AtomicReference<CloseStatus> closeStatus = new AtomicReference<>();
        StandardWebSocketClient client = new StandardWebSocketClient();
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:3000");

        WebSocketSession session = client.execute(
                        new AbstractWebSocketHandler() {
                            @Override
                            public void afterConnectionClosed(
                                    WebSocketSession session,
                                    CloseStatus status
                            ) {
                                closeStatus.set(status);
                                closed.countDown();
                            }
                        },
                        headers,
                        URI.create("ws://localhost:" + port + "/ws"))
                .get(5, TimeUnit.SECONDS);

        assertThat(session.isOpen()).isTrue();
        assertThat(closed.await(15, TimeUnit.SECONDS)).isTrue();
        assertThat(closeStatus.get()).isNotNull();
    }
}
