package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GameStatePushTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final GameStateGateway states = mock(GameStateGateway.class);
    private final GameReconnectService reconnect = mock(GameReconnectService.class);
    private TableHub hub;

    @AfterEach
    void close() {
        if (hub != null) {
            hub.shutdown();
        }
    }

    @Test
    void 참가자별_상태를_따로만들고_다른경기_관전자_개발사용자는_제외한다() throws Exception {
        createHub(Optional.empty());
        Peer first = peer(101L);
        Peer second = peer(202L);
        Peer outsider = peer(303L);
        Peer dev = peer(null);
        when(reconnect.canControlGame(303, outsider.id, "game-1")).thenReturn(false);
        when(states.load(anyLong(), anyString())).thenAnswer(invocation ->
                Optional.of(view(invocation.getArgument(0), 9)));
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        assertPrivate(first.next(), 101, 9);
        assertPrivate(second.next(), 202, 9);
        assertThat(outsider.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(dev.messages).isEmpty();
        verify(states, times(2)).load(anyLong(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"user", "game", "spectator", "empty", "exception", "stale"})
    void 잘못된_사용자별상태나_예외를_전송하지않는다(String kind) throws Exception {
        createHub(Optional.empty());
        Peer player = peer(101L);
        when(states.load(anyLong(), anyString())).thenAnswer(invocation -> {
            if (kind.equals("exception")) {
                throw new IllegalStateException("secret-hand");
            }
            if (kind.equals("empty")) {
                return Optional.empty();
            }
            return Optional.of(new GameStateView(kind.equals("user") ? 202 : 101,
                    kind.equals("game") ? "other" : "game-1", kind.equals("stale") ? 8 : 9,
                    kind.equals("spectator") ? GameStateView.Role.SPECTATOR : GameStateView.Role.PLAYER,
                    mapper.createObjectNode(), kind.equals("spectator") ? mapper.createObjectNode()
                            : mapper.createObjectNode().put("hand", "secret-hand")));
        });
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        JsonNode response = player.next();
        assertThat(response.path("type").asText()).isEqualTo("ERROR");
        assertThat(response.toString()).doesNotContain("secret-hand");
        String expected = switch (kind) {
            case "empty" -> "GAME_STATE_ACCESS_DENIED";
            case "exception" -> "GAME_STATE_UNAVAILABLE";
            case "stale" -> "GAME_STATE_STALE";
            default -> "GAME_STATE_INVALID";
        };
        assertThat(response.path("payload").path("code").asText()).isEqualTo(expected);
    }

    @Test
    void 느린조회중_여러변경은_최신버전으로_합치고_과거상태는_버린다() throws Exception {
        createHub(Optional.empty());
        Peer player = peer(101L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(states.load(101, "game-1")).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                entered.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return Optional.of(view(101, 8));
            }
            return Optional.of(view(101, 10));
        });
        hub.gameStateChanged(new GameStateChanged("game-1", 8));
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.gameStateChanged(new GameStateChanged("game-1", 9));
            hub.gameStateChanged(new GameStateChanged("game-1", 10));
            release.countDown();
            assertPrivate(player.next(), 101, 10);
            hub.gameStateChanged(new GameStateChanged("game-1", 8));
            hub.gameStateChanged(new GameStateChanged("game-1", 10));
            assertThat(player.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            assertThat(calls.get()).isEqualTo(2);
        } finally {
            release.countDown();
        }
    }

    @Test
    void 한참가자의_느린조회가_다른참가자의_전송을_막지않는다() throws Exception {
        createHub(Optional.empty());
        Peer slow = peer(101L);
        Peer fast = peer(202L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(states.load(101, "game-1")).thenAnswer(invocation -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Optional.of(view(101, 9));
        });
        when(states.load(202, "game-1")).thenReturn(Optional.of(view(202, 9)));
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertPrivate(fast.next(), 202, 9);
            assertThat(slow.messages).isEmpty();
            release.countDown();
            assertPrivate(slow.next(), 101, 9);
        } finally {
            release.countDown();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"disconnect", "authority"})
    void 조회도중_끊기거나_권한이_사라지면_개인상태를_보내지않는다(String kind) throws Exception {
        createHub(Optional.empty());
        Peer old = peer(101L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        when(states.load(101, "game-1")).thenAnswer(invocation -> {
            entered.countDown();
            try {
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return Optional.of(view(101, 9));
            } finally {
                completed.countDown();
            }
        });
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            Peer returned = null;
            if (kind.equals("disconnect")) {
                hub.disconnect(old.id);
                returned = peer(101L);
            } else {
                when(reconnect.canControlGame(101, old.id, "game-1")).thenReturn(false);
            }
            release.countDown();
            assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(old.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            if (returned != null) {
                assertThat(returned.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            }
        } finally {
            release.countDown();
        }
    }

    @Test
    void 입력자가_끊겨도_확정된변경은_남은참가자에게_전송한다() throws Exception {
        GameActionGateway actions = mock(GameActionGateway.class);
        createHub(Optional.of(actions));
        Peer first = peer(101L);
        Peer second = peer(202L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(actions.apply(any())).thenAnswer(invocation -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return new GameActionResult(101, "game-1", "a", 9);
        });
        when(states.load(202, "game-1")).thenReturn(Optional.of(view(202, 9)));
        hub.receive(first.id, mapper.writeValueAsString(Map.of("requestId", "request-1", "type", "GAME_ACTION_SEND",
                "payload", Map.of("gameId", "game-1", "actionId", "a", "expectedVersion", 8, "input", Map.of()))));
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.disconnect(first.id);
            release.countDown();
            assertPrivate(second.next(), 202, 9);
            assertThat(first.messages).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    void 최신_자동상태보다_늦은_조회응답은_과거버전을_덮어쓰지않는다() throws Exception {
        createHub(Optional.empty());
        Peer player = peer(101L);
        AtomicInteger calls = new AtomicInteger();
        when(states.load(101, "game-1")).thenAnswer(invocation ->
                Optional.of(view(101, calls.incrementAndGet() == 1 ? 10 : 8)));
        hub.gameStateChanged(new GameStateChanged("game-1", 10));
        assertPrivate(player.next(), 101, 10);
        hub.receive(player.id, "{\"requestId\":\"check\",\"type\":\"GAME_STATE_CHECK\","
                + "\"payload\":{\"gameId\":\"game-1\"}}");
        JsonNode response = player.next();
        assertThat(response.path("requestId").asText()).isEqualTo("check");
        assertThat(response.path("payload").path("code").asText()).isEqualTo("GAME_STATE_STALE");
    }

    @Test
    void 종료된허브에는_조회작업을_추가하지않는다() throws Exception {
        createHub(Optional.empty());
        peer(101L);
        hub.shutdown();
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        verifyNoInteractions(states);
    }

    private GameStateView view(long userId, long version) {
        return new GameStateView(userId, "game-1", version, GameStateView.Role.PLAYER,
                mapper.createObjectNode().put("turn", 101), mapper.createObjectNode().put("hand", "hand-" + userId));
    }

    private void assertPrivate(JsonNode response, long userId, long version) {
        assertThat(response.path("type").asText()).isEqualTo("GAME_STATE");
        assertThat(response.path("requestId").isNull()).isTrue();
        assertThat(response.path("payload").path("version").asLong()).isEqualTo(version);
        assertThat(response.path("payload").path("privateState").path("hand").asText()).isEqualTo("hand-" + userId);
        assertThat(response.path("payload").path("publicState").path("turn").asInt()).isEqualTo(101);
        assertThat(response.path("payload").has("userId")).isFalse();
    }

    private void createHub(Optional<GameActionGateway> actions) {
        when(reconnect.canControlGame(anyLong(), anyString(), anyString())).thenReturn(true);
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(reconnect),
                Duration.ofSeconds(60), Duration.ofSeconds(60),
                new WorldChannelRegistry(new WorldChannelProperties(null)), new WorldChatService(Duration.ofSeconds(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)), Optional.of(states), actions);
    }

    private Peer peer(Long userId) throws Exception {
        Peer peer = new Peer(UUID.randomUUID().toString(), new LinkedBlockingQueue<>());
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            peer.messages.add(mapper.readTree(((TextMessage) invocation.getArgument(0)).getPayload()));
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        if (userId == null) {
            hub.connect(session);
        } else {
            assertThat(hub.connectAuthenticated(session,
                    new VerifiedWebSocketUser(userId, VerifiedWebSocketUser.Provider.NAVER))).isTrue();
        }
        assertThat(peer.next().path("type").asText()).isEqualTo("CONNECTED");
        return peer;
    }

    private record Peer(String id, BlockingQueue<JsonNode> messages) {
        JsonNode next() throws Exception {
            JsonNode next = messages.poll(5, TimeUnit.SECONDS);
            assertThat(next).isNotNull();
            return next;
        }
    }
}
