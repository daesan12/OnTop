package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameReconnectWebSocketTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class GameReconnectWebSocketTests {

    private final ObjectMapper mapper = new ObjectMapper();

    @LocalServerPort
    private int port;
    @Autowired
    private Engine engine;
    @Autowired
    private TestClock clock;

    @Test
    void 실제소켓_재접속은_현재경기와_본인정보만_복원하고_턴시간은_유지한다() throws Exception {
        try (Client other = new Client("ssafy")) {
            assertThat(other.state("RESTORED").path("state").path("hand").asText()).isEqualTo("private-202");
            Client first = new Client("naver");
            try {
                assertThat(first.state("RESTORED").path("gameId").asText()).isEqualTo("game-1");
                assertThat(first.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                        .path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
                assertThat(first.request("GAME_RECONNECT_CHECK", Map.of("userId", 202))
                        .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
                engine.loads.clear();
            } finally {
                first.close();
            }
            assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
            clock.now = clock.now.plusSeconds(29);
            engine.version = 8;
            try (Client returned = new Client("naver")) {
                JsonNode state = returned.state("RESTORED");
                assertThat(state.path("gameId").asText()).isEqualTo("game-1");
                assertThat(state.path("version").asLong()).isEqualTo(8);
                assertThat(state.path("state").path("hand").asText()).isEqualTo("private-101");
                assertThat(state.path("state").path("turnDeadline").asText()).isEqualTo("engine-deadline");
                assertThat(engine.expirations).isEmpty();
            }
        }
    }

    @Test
    void 삼십초_경계에서는_만료처리전_경기정보를_주지않고_완료상태를_다시_조회한다() throws Exception {
        Client first = new Client("naver");
        try {
            first.state("RESTORED");
            engine.loads.clear();
        } finally {
            first.close();
        }
        assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
        clock.now = clock.now.plusSeconds(30);
        try (Client returned = new Client("naver")) {
            JsonNode expired = returned.state("EXPIRED");
            assertThat(expired.path("state").isNull()).isTrue();
            assertThat(engine.expirations.poll(5, TimeUnit.SECONDS).action())
                    .isEqualTo(GameRecoveryGateway.Action.FORFEIT);
            engine.phase = Phase.FINISHED;
            returned.request("GAME_RECONNECT_CHECK", Map.of());
            assertThat(returned.state("FINISHED").path("gameId").asText()).isEqualTo("game-1");
            assertThat(returned.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .path("type").asText()).isEqualTo("TABLE_STATE");
        }
    }

    private class Client implements WebSocket.Listener, AutoCloseable {
        private final HttpClient http = HttpClient.newHttpClient();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final StringBuilder fragments = new StringBuilder();
        private final WebSocket socket;

        private Client(String login) throws Exception {
            socket = http.newWebSocketBuilder().header("X-Test-Login", login)
                    .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tables"), this).join();
            await(message -> message.path("type").asText().equals("CONNECTED"));
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence text, boolean last) {
            fragments.append(text);
            if (last) {
                messages.add(fragments.toString());
                fragments.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        private JsonNode state(String status) throws Exception {
            return await(message -> message.path("type").asText().equals("GAME_CONNECTION_STATE")
                    && message.path("payload").path("status").asText().equals(status)).path("payload");
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String id = UUID.randomUUID().toString();
            socket.sendText(mapper.writeValueAsString(Map.of("type", type, "requestId", id,
                    "payload", payload)), true).join();
            return await(message -> message.path("requestId").asText().equals(id));
        }

        private JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                String text = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(text).isNotNull();
                JsonNode message = mapper.readTree(text);
                if (predicate.test(message)) {
                    return message;
                }
            }
        }

        @Override
        public void close() {
            socket.abort();
            http.close();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        Engine engine() {
            return new Engine();
        }

        @Bean
        TestClock testClock() {
            return new TestClock();
        }
    }

    // 실제 경기 담당의 상태 저장소를 대신하는 테스트 전용 대역.
    static class Engine implements GameRecoveryGateway {
        private final BlockingQueue<Long> loads = new LinkedBlockingQueue<>();
        private final BlockingQueue<GraceExpiration> expirations = new LinkedBlockingQueue<>();
        private volatile long version = 1;
        private volatile Phase phase = Phase.PLAYING;

        @Override
        public Optional<GameRecoverySnapshot> load(long userId) {
            GameRecoverySnapshot snapshot = new GameRecoverySnapshot(userId, "game-1", 2, version, phase,
                    new ObjectMapper().createObjectNode().put("hand", "private-" + userId)
                            .put("turnDeadline", "engine-deadline"));
            loads.add(userId);
            return Optional.of(snapshot);
        }

        @Override
        public void graceExpired(GraceExpiration command) {
            expirations.add(command);
        }
    }

    static class TestClock extends Clock {
        private volatile Instant now = Instant.parse("2026-10-19T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
