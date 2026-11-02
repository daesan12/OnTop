package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.reconnect.ActiveGameLookup;
import com.ssafy.ontop.game.reconnect.ActiveGameRecord;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.reconnect.TerminalGameRecovery;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import com.ssafy.ontop.table.service.TableHub;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Instant;
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
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=복구 검증",
        "ontop.world.channels[0].capacity=20"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameReconnectConsistencyWebSocketTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class GameReconnectConsistencyWebSocketTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @LocalServerPort
    private int port;
    @Autowired
    private Engine engine;
    @Autowired
    private Lookup lookup;
    @Autowired
    private TableHub hub;

    @Test
    void 자동조회와_수동조회가_DB엔진대조를_공유하고_불일치중_로비진입을_막는다() throws Exception {
        try (Client client = new Client()) {
            JsonNode unavailable = client.state("UNAVAILABLE");
            assertThat(unavailable.path("code").asText()).isEqualTo("RECOVERY_UNAVAILABLE");
            assertThat(unavailable.path("gameId").isNull()).isTrue();
            assertThat(client.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");

            engine.available = true;
            client.send("GAME_RECONNECT_CHECK", Map.of());
            JsonNode restored = client.state("RESTORED");
            assertThat(restored.path("gameId").asText()).isEqualTo("1");
            assertThat(restored.at("/state/hand").asText()).isEqualTo("private-101");
        }
    }

    @Test
    void UNAVAILABLE연결은_유지되고_정산마커해제뒤_수동재확인으로_LOBBY가_된다() throws Exception {
        try (Client client = new Client()) {
            client.state("UNAVAILABLE");
            assertThat(client.request("WORLD_TIME_CHECK", Map.of()).path("type").asText())
                    .isEqualTo("WORLD_TIME_STATE");
            lookup.active = false;
            client.send("GAME_RECONNECT_CHECK", Map.of());
            assertThat(client.state("LOBBY").path("gameId").isNull()).isTrue();
            assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                    .path("type").asText()).isEqualTo("CHANNEL_STATE");
            assertThat(client.request("TABLE_JOIN", Map.of("tableId", tableId()))
                    .path("type").asText()).isEqualTo("TABLE_STATE");
        }
    }

    @Test
    void 이전서버_종료경기는_수동재확인시_기존정산연결후_채널입장과_착석이_가능하다() throws Exception {
        try (Client client = new Client()) {
            client.state("UNAVAILABLE");
            lookup.terminal = true;
            client.send("GAME_RECONNECT_CHECK", Map.of());
            assertThat(client.state("LOBBY").path("gameId").isNull()).isTrue();
            assertThat(lookup.active).isFalse();
            JsonNode joined = client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            assertThat(joined.path("type").asText()).as(joined.toString()).isEqualTo("CHANNEL_STATE");
            assertThat(client.request("TABLE_JOIN", Map.of("tableId", tableId()))
                    .path("type").asText()).isEqualTo("TABLE_STATE");
        }
    }

    private String tableId() {
        return hub.listTables("channel-1").tables().getFirst().tableId();
    }

    private class Client implements WebSocket.Listener, AutoCloseable {
        private final HttpClient http = HttpClient.newHttpClient();
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final StringBuilder fragments = new StringBuilder();
        private final WebSocket socket;

        private Client() {
            socket = http.newWebSocketBuilder().header("X-Test-Login", "naver")
                    .buildAsync(URI.create("ws://127.0.0.1:" + port + "/ws/tables"), this).join();
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
                    && message.at("/payload/status").asText().equals(status)).path("payload");
        }

        private void send(String type, Object payload) throws Exception {
            socket.sendText(mapper.writeValueAsString(Map.of("type", type,
                    "requestId", UUID.randomUUID().toString(), "payload", payload)), true).join();
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            socket.sendText(mapper.writeValueAsString(Map.of("type", type,
                    "requestId", requestId, "payload", payload)), true).join();
            return await(message -> message.path("requestId").asText().equals(requestId));
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
        GameRuntimeIdentity gameRuntimeIdentity() {
            return new GameRuntimeIdentity("reconnect-ws-test");
        }

        @Bean
        Lookup activeGameLookup(GameRuntimeIdentity identity) {
            return new Lookup(identity);
        }

        @Bean
        Engine engine() {
            return new Engine();
        }

        @Bean
        TerminalGameRecovery terminalGameRecovery(Lookup lookup) {
            return (user, game) -> {
                assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
                lookup.active = false;
            };
        }
    }

    static class Lookup implements ActiveGameLookup {
        private final ActiveGameRecord record;
        private volatile boolean active = true;
        private volatile boolean terminal;

        Lookup(GameRuntimeIdentity identity) {
            Instant reserved = Instant.parse("2026-10-29T00:00:00Z");
            record = new ActiveGameRecord(1, "OMOK", "table-1", GameSession.Status.RUNNING,
                    GameSession.SettlementStatus.PENDING, identity.instanceId(), identity.bootId(),
                    reserved, reserved.plusSeconds(1), null);
        }

        @Override
        public Optional<ActiveGameRecord> findByUserId(long userId) {
            if (active && terminal) {
                return Optional.of(new ActiveGameRecord(record.gameSessionId(), "ALKKAGI", record.tableId(),
                        GameSession.Status.FINISHED, GameSession.SettlementStatus.PENDING,
                        "previous-server", UUID.randomUUID(), record.reservedAt(), record.startedAt(),
                        record.startedAt().plusSeconds(1)));
            }
            return active ? Optional.of(record) : Optional.empty();
        }
    }

    static class Engine implements GameRecoveryGateway {
        private volatile boolean available;

        @Override
        public Optional<GameRecoverySnapshot> load(long userId) {
            if (!available) {
                return Optional.empty();
            }
            return Optional.of(new GameRecoverySnapshot(userId, "1", 2, 1,
                    GameRecoverySnapshot.Phase.PLAYING,
                    new ObjectMapper().createObjectNode().put("hand", "private-" + userId)));
        }

        @Override
        public void graceExpired(GraceExpiration command) {
        }
    }
}
