package com.ssafy.ontop.table;

import com.ssafy.ontop.table.websocket.WebSocketIngressGuard;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=false",
        "ontop.websocket.limits.messages-per-second=1", "ontop.websocket.limits.burst=3",
        "ontop.websocket.limits.max-connections=2", "ontop.websocket.limits.max-connections-per-address=2"})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WebSocketIngressFlowTests {
    @LocalServerPort int port;
    @Autowired WebSocketIngressGuard guard;
    @Autowired MeterRegistry metrics;

    @Test void 실제소켓의정상시간조회는응답하고_폭주는1013으로종료하며_다른연결은유지한다() throws Exception {
        try (var first = new ScenarioClient(port, "first"); var second = new ScenarioClient(port, "second")) {
            first.await(message -> message.path("type").asText().equals("CONNECTED"));
            second.await(message -> message.path("type").asText().equals("CONNECTED"));
            for (int i = 0; i < 3; i++) {
                assertThat(first.request("WORLD_TIME_CHECK", Map.of()).path("type").asText()).isEqualTo("WORLD_TIME_STATE");
            }
            try {
                // 응답을 기다리지 않는 작은 초과 묶음으로 느린 CI의 토큰 회복에도 경계를 넘는다.
                for (int i = 0; i < 12; i++) { first.sendRequest("WORLD_TIME_CHECK", Map.of()); }
            } catch (java.io.IOException closedWhileSending) {
                // 서버가 먼저 닫았더라도 아래의 실제 Close Code로 결과를 확인한다.
            }
            assertThat(first.awaitClose()).isEqualTo(1013);
            assertThat(second.request("WORLD_TIME_CHECK", Map.of()).path("type").asText()).isEqualTo("WORLD_TIME_STATE");
            await().untilAsserted(() -> assertThat(guard.activeConnections()).isEqualTo(1));
            assertThat(metrics.get("ontop.websocket.ingress.rejected").tag("reason", "RATE").functionCounter().count()).isEqualTo(1);
        }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
    }

    @Test void 접속상한은새소켓만거절하고_정상종료뒤다시접속할수있다() throws Exception {
        try (var first = new ScenarioClient(port, "first"); var second = new ScenarioClient(port, "second")) {
            first.await(message -> message.path("type").asText().equals("CONNECTED"));
            second.await(message -> message.path("type").asText().equals("CONNECTED"));
            try (var refused = new ScenarioClient(port, "third")) { assertThat(refused.awaitClose()).isEqualTo(1013); }
            assertThat(guard.activeConnections()).isEqualTo(2);
            first.close();
            await().untilAsserted(() -> assertThat(guard.activeConnections()).isEqualTo(1));
            try (var returned = new ScenarioClient(port, "fourth")) {
                returned.await(message -> message.path("type").asText().equals("CONNECTED"));
                assertThat(returned.request("WORLD_TIME_CHECK", Map.of()).path("type").asText()).isEqualTo("WORLD_TIME_STATE");
            }
        }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
    }

    @Test void 실제멀티바이트_초과메시지는1009이며_정상연결슬롯을돌려준다() throws Exception {
        try (var first = new ScenarioClient(port, "oversized")) {
            first.await(message -> message.path("type").asText().equals("CONNECTED"));
            first.sendRequest("WORLD_TIME_CHECK", Map.of("padding", "한".repeat(5500)));
            assertThat(first.awaitClose()).isEqualTo(1009);
        }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
    }

    @Test void 분할메시지도_합친16KiB까지처리하고_한바이트초과하면정리한다() throws Exception {
        var received = new java.util.concurrent.LinkedBlockingQueue<String>();
        var closed = new java.util.concurrent.CompletableFuture<Integer>();
        var listener = new java.net.http.WebSocket.Listener() {
            private final StringBuilder text = new StringBuilder();
            @Override public void onOpen(java.net.http.WebSocket socket) { socket.request(1); }
            @Override public java.util.concurrent.CompletionStage<?> onText(java.net.http.WebSocket socket,
                    CharSequence data, boolean last) {
                text.append(data);
                if (last) { received.add(text.toString()); text.setLength(0); }
                socket.request(1);
                return java.util.concurrent.CompletableFuture.completedFuture(null);
            }
            @Override public java.util.concurrent.CompletionStage<?> onClose(java.net.http.WebSocket socket,
                    int status, String reason) {
                closed.complete(status);
                return java.util.concurrent.CompletableFuture.completedFuture(null);
            }
            @Override public void onError(java.net.http.WebSocket socket, Throwable failure) {
                closed.completeExceptionally(failure);
            }
        };
        try (var http = java.net.http.HttpClient.newHttpClient()) {
            var socket = http.newWebSocketBuilder().buildAsync(java.net.URI.create("ws://127.0.0.1:" + port
                    + "/ws/tables"), listener).join();
            try {
                assertThat(received.poll(5, java.util.concurrent.TimeUnit.SECONDS)).contains("CONNECTED");
                String base = "{\"requestId\":\"boundary\",\"type\":\"WORLD_TIME_CHECK\",\"payload\":{}}";
                String boundary = base + " ".repeat(16384 - base.length());
                socket.sendText(boundary.substring(0, 8192), false).join();
                socket.sendText(boundary.substring(8192), true).join();
                assertThat(received.poll(5, java.util.concurrent.TimeUnit.SECONDS)).contains("WORLD_TIME_STATE");
                socket.sendText(boundary.substring(0, 8192), false).join();
                socket.sendText(boundary.substring(8192) + " ", true).join();
                assertThat(closed.get(5, java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(1009);
            } finally { socket.abort(); }
        }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
    }
}
