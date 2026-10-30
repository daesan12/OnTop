package com.ssafy.ontop.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AlkkagiDemoApplication.DemoConfig.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.profiles.active=alkkagi-physics-demo", "spring.flyway.enabled=false",
                "server.address=127.0.0.1"})
class AlkkagiSocketTests {
    @LocalServerPort private int port;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 두_화면이_같은_물리_스냅샷을_받고_관전자는_발사할_수_없다() throws Exception {
        var a = new Reader(); var b = new Reader();
        WebSocket red = open("red", a), viewer = open("viewer", b);
        try {
            var first = a.until(m -> m.path("type").asText().equals("STATE"));
            viewer.sendText("{\"type\":\"START\"}", true).join();
            assertThat(b.until(m -> m.path("type").asText().equals("ERROR")).path("code").asText())
                    .isEqualTo("PLAYER_REQUIRED");
            red.sendText("{\"type\":\"START\"}", true).join();
            var ready = a.until(m -> m.path("state").path("stage").asText().equals("AIMING"));
            String shot = "{\"type\":\"SHOT\",\"gameId\":\"" + first.path("state").path("gameId").asText()
                    + "\",\"actionId\":\"integration-1\",\"expectedVersion\":"
                    + ready.path("state").path("version").asLong()
                    + ",\"pieceId\":\"p11\",\"dx\":0,\"dy\":-1,\"power\":0.8}";
            red.sendText(shot, true).join();
            a.until(m -> m.path("type").asText().equals("SHOT_ACCEPTED"));
            var moving = a.until(m -> m.path("state").path("stage").asText().equals("SIMULATING"));
            var same = b.until(m -> m.path("seq").asLong(-1) == moving.path("seq").asLong());

            assertThat(same.path("state")).isEqualTo(moving.path("state"));
            red.sendText(shot, true).join();
            assertThat(a.until(m -> m.path("type").asText().equals("SHOT_ACCEPTED"))
                    .path("version").asLong()).isEqualTo(2);
            viewer.sendClose(1000, "reconnect").join();
            var recovery = new Reader(); viewer = open("viewer", recovery);
            assertThat(recovery.until(m -> m.path("type").asText().equals("STATE"))
                    .path("state").path("simulationId").asLong()).isEqualTo(1);
        } finally {
            red.abort(); viewer.abort();
        }
    }

    private WebSocket open(String role, Reader reader) {
        return HttpClient.newHttpClient().newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create("ws://127.0.0.1:" + port + "/dev/alkkagi-ws?role=" + role), reader).join();
    }

    private final class Reader implements WebSocket.Listener {
        private final LinkedBlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private final StringBuilder partial = new StringBuilder();
        @Override public void onOpen(WebSocket socket) { socket.request(1); }
        @Override public java.util.concurrent.CompletionStage<?> onText(WebSocket socket, CharSequence data,
                boolean last) {
            partial.append(data);
            if (last) {
                try { messages.add(mapper.readTree(partial.toString())); }
                catch (Exception exception) { throw new IllegalStateException(exception); }
                partial.setLength(0);
            }
            socket.request(1);
            return null;
        }
        private JsonNode until(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
            while (System.nanoTime() < deadline) {
                JsonNode message = messages.poll(200, TimeUnit.MILLISECONDS);
                if (message != null && predicate.test(message)) { return message; }
            }
            throw new AssertionError("기대 소켓 메시지 시간 초과");
        }
    }
}
