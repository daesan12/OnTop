package com.ssafy.ontop.table;

import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import io.micrometer.core.instrument.MeterRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "spring.application.name=ontop-close-reason-test",
        "ontop.websocket.heartbeat.interval=100ms", "ontop.websocket.heartbeat.timeout=1s"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ConnectionCloseReasonWebSocketTests {

    @LocalServerPort
    private int port;
    @Autowired
    private TableHub hub;
    @Autowired
    private MeterRegistry registry;

    @Test
    void 정상_Close는_소켓종료로_한번_집계한다() throws Exception {
        CountDownLatch connected = new CountDownLatch(1);
        try (HttpClient client = HttpClient.newHttpClient()) {
            WebSocket socket = client.newWebSocketBuilder().buildAsync(
                    URI.create("ws://127.0.0.1:" + port + "/ws/tables"), new WebSocket.Listener() {
                        @Override
                        public java.util.concurrent.CompletionStage<?> onText(WebSocket webSocket,
                                CharSequence data, boolean last) {
                            connected.countDown();
                            webSocket.request(1);
                            return null;
                        }
                    }).join();
            try {
                assertThat(connected.await(5, TimeUnit.SECONDS)).isTrue();
                socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
                assertClosed(ConnectionCloseReason.SOCKET_CLOSED);
            } finally {
                socket.abort();
            }
        }
    }

    @Test
    void 실제_heartbeat_무응답은_뒤의_Close이벤트에도_만료사유를_유지한다() throws Exception {
        try (ScenarioClient client = new ScenarioClient(port, "close-reason")) {
            client.await(message -> message.path("type").asText().equals("CONNECTED"));
            client.stopPong();
            assertThat(client.awaitClose()).isEqualTo(1001);
            assertClosed(ConnectionCloseReason.HEARTBEAT_TIMEOUT);
        }
    }

    private void assertClosed(ConnectionCloseReason expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (hub.closedConnections(expected) == 0 && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertThat(hub.closedConnections(expected)).isEqualTo(1);
        assertThat(hub.metricsSnapshot().closedConnections()).isEqualTo(1);
        long sum = 0;
        for (ConnectionCloseReason reason : ConnectionCloseReason.values()) {
            sum += hub.closedConnections(reason);
        }
        assertThat(sum).isEqualTo(1);
        assertThat(registry.get("ontop.websocket.connections.closed.by.reason").tag("reason", expected.name())
                .functionCounter().count()).isEqualTo(1);
    }
}
