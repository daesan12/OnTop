package com.ssafy.ontop.table;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true"
})
class AuthenticationUnavailableTests {

    @LocalServerPort
    private int port;

    @Test
    void 실제_검증기없이_인증모드만_켜면_임시사용자로_대체하지_않는다() {
        try (HttpClient http = HttpClient.newHttpClient()) {
            assertThatThrownBy(() -> http.newWebSocketBuilder()
                    .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tables"),
                            new WebSocket.Listener() { }).join())
                    .hasCauseInstanceOf(WebSocketHandshakeException.class)
                    .satisfies(error -> assertThat(((WebSocketHandshakeException) error.getCause())
                            .getResponse().statusCode()).isEqualTo(503));
        }
    }
}
