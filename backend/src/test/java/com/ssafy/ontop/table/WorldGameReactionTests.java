package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.result.GameDefeatConfirmed;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import com.ssafy.ontop.world.service.WorldProximity;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Hub와 실제 송신 큐/JSON 검증. 인증·예약 결과와 서버 위치는 테스트 대역이다. */
class WorldGameReactionTests {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            "one\0table-1".getBytes(StandardCharsets.UTF_8));

    @ParameterizedTest
    @ValueSource(strings = {"OMOK", "DICE_LEDGER"})
    void 참가자와_20m_비구독자에게만_한번_전달하고_재접속에_재생하지_않는다(String gameCode) throws Exception {
        var properties = new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("one", "하나", 8),
                new WorldChannelProperties.Channel("two", "둘", 8)));
        var time = new AtomicLong();
        var channels = new WorldChannelRegistry(properties, Duration.ofNanos(1), time::incrementAndGet);
        var proximity = new WorldProximity(channels, new WorldProximityProperties(20.0, 20.0,
                Map.of(TABLE, new WorldProximityProperties.Point(0.0, 0.0))));
        GameStartGateway gateway = new GameStartGateway() {
            private GameStartCommand command;
            @Override public GameStartResult startGame(GameStartCommand input) {
                command = input;
                return GameStartResult.reserved(input, "game");
            }
            @Override public GameStartResult findStartResult(UUID id) {
                return GameStartResult.reserved(command, "game");
            }
        };
        var hub = new TableHub(mapper, Optional.of(gateway), true, Optional.empty(),
                Duration.ofMinutes(1), Duration.ofMinutes(1), channels, new WorldChatService(Duration.ofMillis(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofMillis(1)), Optional.empty(),
                Optional.empty(), Optional.empty(), proximity);
        try {
            Peer first = peer(hub, 101, "one");
            Peer second = peer(hub, 202, "one");
            Peer near = peer(hub, 303, "one");
            Peer far = peer(hub, 404, "one");
            Peer other = peer(hub, 505, "two");
            channels.move("303", new WorldChannelRegistry.Position(1, 20, .8, 0, 0));
            channels.move("404", new WorldChannelRegistry.Position(1, 20.01, .8, 0, 0));
            channels.move("505", new WorldChannelRegistry.Position(1, 0, .8, 0, 0));
            first.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("GAME_SELECT", Map.of("gameCode", gameCode, "betAmountPerPlayer", 1));
            second.request("TABLE_JOIN", Map.of("tableId", TABLE));
            ready(first);
            ready(second);
            first.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.at("/payload/phase").asText().equals("CONFIRMED"));
            channels.move("101", new WorldChannelRegistry.Position(2, 50, .8, 0, 0));
            first.fence(); second.fence(); near.fence(); far.fence(); other.fence();
            var event = new GameDefeatConfirmed("game:reaction:101", "game", TABLE, gameCode, 1,
                    101, GameDefeatConfirmed.Kind.FORFEIT, 2, Instant.parse("2026-10-26T09:00:00Z"));
            hub.gameDefeatConfirmed(event);
            hub.gameDefeatConfirmed(event);
            JsonNode one = first.reaction();
            assertThat(second.reaction().path("payload")).isEqualTo(one.path("payload"));
            assertThat(near.reaction().path("payload")).isEqualTo(one.path("payload"));
            assertThat(one.path("requestId").isNull()).isTrue();
            assertThat(one.at("/payload/userId").asText()).isEqualTo("101");
            assertThat(one.at("/payload/motion").asText()).isEqualTo("table-flip");
            assertThat(one.at("/payload/remainingBefore").asInt()).isEqualTo(2);
            assertThat(one.path("payload").fieldNames()).toIterable().containsExactlyInAnyOrder(
                    "eventId", "gameId", "tableId", "channelId", "gameCode", "version", "userId", "kind",
                    "remainingBefore", "motion", "durationMs", "occurredAt", "participantCount");
            first.fence(); second.fence(); near.fence(); far.fence(); other.fence();
            for (Peer peer : List.of(first, second, near, far)) {
                assertThat(peer.debris()).hasSize(1);
                assertThat(peer.debris().getFirst().at("/payload/items/0/parts"))
                        .hasSize("OMOK".equals(gameCode) ? 18 : 13);
                assertThat(peer.debris().getFirst().at("/payload/items/0/gameCode").asText()).isEqualTo(gameCode);
            }
            assertThat(other.debris()).isEmpty();
            for (Peer peer : List.of(first, second, near, far, other)) { assertThat(peer.reactions()).isEmpty(); }

            hub.gameDefeatConfirmed(new GameDefeatConfirmed("old:reaction:202", "old", TABLE, "OMOK", 5,
                    202, GameDefeatConfirmed.Kind.DEFEAT, 2, event.occurredAt()));
            first.fence(); assertThat(first.reactions()).isEmpty();
            hub.disconnect(near.id);
            Peer returned = peer(hub, 303, "one");
            returned.fence();
            assertThat(returned.debris()).hasSize(1);
            assertThat(returned.reactions()).isEmpty();
            assertThat(hub.cleanParkDebris("one", event.eventId(), "coin-0")).isTrue();
            returned.fence();
            assertThat(returned.debris().getLast().at("/payload/items/0/parts").toString()).doesNotContain("coin-0\"");
        } finally { hub.shutdown(); }
    }

    private void ready(Peer peer) throws Exception {
        JsonNode state = peer.request("TABLE_JOIN", Map.of("tableId", TABLE)).path("payload");
        peer.request("READY_SET", Map.of("ready", true, "expectedVersion", state.path("version").longValue(),
                "betAmountPerPlayer", state.path("betAmountPerPlayer").longValue()));
    }

    private Peer peer(TableHub hub, long user, String channel) throws Exception {
        var peer = new Peer(hub);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(call -> {
            peer.messages.add(mapper.readTree(((TextMessage) call.getArgument(0)).getPayload()));
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        assertThat(hub.connectAuthenticated(session,
                new VerifiedWebSocketUser(user, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
        peer.await(message -> message.path("type").asText().equals("CONNECTED"));
        peer.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return peer;
    }

    private final class Peer {
        private final String id = UUID.randomUUID().toString();
        private final TableHub hub;
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private final List<JsonNode> observed = new java.util.ArrayList<>();
        private Peer(TableHub hub) { this.hub = hub; }
        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            return await(message -> message.path("requestId").asText().equals(requestId));
        }
        private JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                JsonNode message = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(message).isNotNull();
                if (predicate.test(message)) { return message; }
                observed.add(message);
            }
        }
        private JsonNode reaction() throws Exception {
            return await(message -> message.path("type").asText().equals("WORLD_GAME_REACTION"));
        }
        private void fence() throws Exception { request("WORLD_FOLLOW_CHECK", Map.of()); }
        private List<JsonNode> debris() {
            return observed.stream().filter(message -> message.path("type").asText().equals("WORLD_PARK_DEBRIS_STATE")
                    && message.at("/payload/version").asLong() > 0).toList();
        }
        private List<JsonNode> reactions() {
            var result = observed.stream().filter(message -> message.path("type").asText()
                    .equals("WORLD_GAME_REACTION")).toList();
            observed.clear();
            return result;
        }
    }
}
