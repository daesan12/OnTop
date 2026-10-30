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
    void 송신기가_쉬는_중에도_물리_직렬화_실패를_전달한다() throws Exception {
        var failing = new ObjectMapper() {
            @Override public String writeValueAsString(Object value) throws com.fasterxml.jackson.core.JsonProcessingException {
                throw new com.fasterxml.jackson.core.JsonProcessingException("expected local serialization failure") { };
            }
        };
        var session = org.mockito.Mockito.mock(org.springframework.web.socket.WebSocketSession.class);
        org.mockito.Mockito.when(session.getId()).thenReturn("failure-test");
        org.mockito.Mockito.when(session.getUri()).thenReturn(URI.create("ws://127.0.0.1/dev/alkkagi-ws?role=viewer"));
        org.mockito.Mockito.when(session.isOpen()).thenReturn(true);
        var received = new LinkedBlockingQueue<String>();
        org.mockito.Mockito.doAnswer(invocation -> {
            received.add(invocation.getArgument(0, org.springframework.web.socket.WebSocketMessage.class).getPayload().toString());
            return null;
        }).when(session).sendMessage(org.mockito.ArgumentMatchers.any());
        try (var socket = new AlkkagiDemoApplication.DemoSocket(failing)) {
            socket.afterConnectionEstablished(session);
            assertThat(received.poll(2, TimeUnit.SECONDS)).contains("SIMULATION_FAILURE");
        }
    }

    @Test
    void 로컬_홍팀만_범위내_물리값을_새판에_적용하고_초기화할_수_있다() throws Exception {
        var a = new Reader(); var b = new Reader();
        WebSocket red = open("red", a), green = open("green", b);
        try {
            var first = a.until(m -> m.path("type").asText().equals("STATE"));
            red.sendText("{\"type\":\"RESET\"}", true).join();
            var ready = a.until(m -> m.path("type").asText().equals("STATE")
                    && !m.path("state").path("gameId").equals(first.path("state").path("gameId")));
            String prefix = "{\"type\":\"TUNE\",\"gameId\":\"" + ready.path("state").path("gameId").asText()
                    + "\",\"expectedVersion\":0,";
            String valid = prefix + "\"maximumImpulse\":7.5,\"deceleration\":4.5,\"restitution\":0.65}";
            green.sendText(valid, true).join();
            assertThat(b.until(m -> m.path("type").asText().equals("ERROR")).path("code").asText())
                    .isEqualTo("RED_TUNING_ONLY");
            for (String invalid : new String[]{"0", "61", "\"NaN\"", "1e309"}) {
                red.sendText(prefix + "\"maximumImpulse\":12,\"deceleration\":" + invalid
                        + ",\"restitution\":0.9}", true).join();
                assertThat(a.until(m -> m.path("type").asText().equals("ERROR")).path("code").asText())
                        .isEqualTo("INVALID_TUNING");
            }
            red.sendText(valid, true).join();
            a.until(m -> m.path("type").asText().equals("TUNING_APPLIED"));
            var applied = a.until(m -> m.path("type").asText().equals("STATE")
                    && !m.path("state").path("gameId").equals(ready.path("state").path("gameId")));
            var remote = b.until(m -> m.path("seq").equals(applied.path("seq")));

            assertThat(applied.path("state")).isEqualTo(remote.path("state"));
            assertThat(applied.path("state").path("settings").path("maximumImpulse").asDouble()).isEqualTo(7.5);
            assertThat(applied.path("state").path("settings").path("deceleration").asDouble()).isEqualTo(4.5);
            assertThat(applied.path("state").path("settings").path("restitution").asDouble()).isEqualTo(.65);
            assertThat(applied.path("state").path("stage").asText()).isEqualTo("WAITING");
            red.sendText(valid, true).join();
            assertThat(a.until(m -> m.path("type").asText().equals("ERROR")).path("code").asText())
                    .isEqualTo("STALE_TUNING");
            red.sendText("{\"type\":\"RESET\"}", true).join();
            var reset = a.until(m -> m.path("type").asText().equals("STATE")
                    && !m.path("state").path("gameId").equals(applied.path("state").path("gameId")));
            assertThat(reset.path("state").path("settings").path("maximumImpulse").asDouble()).isEqualTo(7.5);
            red.sendText("{\"type\":\"TUNE_RESET\",\"gameId\":\"" + reset.path("state").path("gameId").asText()
                    + "\",\"expectedVersion\":0}", true).join();
            var defaults = a.until(m -> m.path("type").asText().equals("STATE")
                    && !m.path("state").path("gameId").equals(reset.path("state").path("gameId")));
            assertThat(defaults.path("state").path("settings").path("maximumImpulse").asDouble()).isEqualTo(30);
            assertThat(defaults.path("state").path("settings").path("deceleration").asDouble()).isEqualTo(60);
            assertThat(defaults.path("state").path("settings").path("restitution").asDouble()).isEqualTo(1);
            assertThat(defaults.path("state").path("modelId").asText()).isEqualTo("separated-v1");
            assertThat(defaults.path("state").path("inputCurveBoost").asDouble()).isEqualTo(.5);
            assertThat(defaults.path("state").path("pieces").get(8).path("launchSpeed").asDouble()).isEqualTo(25);
        } finally {
            red.abort(); green.abort();
        }
    }

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
