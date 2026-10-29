package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView.Role;
import com.ssafy.ontop.game.state.GameStateView;
import com.ssafy.ontop.table.dto.TableProtocol;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameStateTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final GameStateGateway gateway = mock(GameStateGateway.class);
    private final GameReconnectService reconnect = mock(GameReconnectService.class);
    private TableHub hub;

    @AfterEach
    void close() {
        if (hub != null) {
            hub.shutdown();
        }
    }

    @Test
    void 본인상태만_응답하고_다른연결에는_전송하지않는다() throws Exception {
        createHub(Optional.of(gateway));
        Peer first = peer(101L);
        Peer second = peer(202L);
        when(gateway.load(101, "game-1")).thenReturn(Optional.of(view(101, "game-1")));
        send(first);
        JsonNode response = first.next();
        assertThat(response.path("type").asText()).isEqualTo("GAME_STATE");
        assertThat(response.path("requestId").asText()).isEqualTo("check");
        assertThat(response.path("payload").path("privateState").path("hand").asText()).isEqualTo("hand-101");
        assertThat(response.path("payload").has("userId")).isFalse();
        assertThat(second.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 임시사용자와_미설정연결부는_명시적으로_거절한다() throws Exception {
        createHub(Optional.empty());
        Peer dev = peer(null);
        send(dev);
        assertThat(dev.next().path("payload").path("code").asText()).isEqualTo("GAME_STATE_AUTH_REQUIRED");
        Peer user = peer(101L);
        send(user);
        assertThat(user.next().path("payload").path("code").asText()).isEqualTo("GAME_STATE_NOT_CONFIGURED");
    }

    @Test
    void 접근불가와_다른사용자_다른경기_응답은_노출하지않는다() throws Exception {
        createHub(Optional.of(gateway));
        Peer first = peer(101L);
        when(gateway.load(101, "game-1")).thenReturn(Optional.empty(),
                Optional.of(view(202, "game-1")), Optional.of(view(101, "other-game")));
        for (String code : new String[]{"GAME_STATE_ACCESS_DENIED", "GAME_STATE_INVALID", "GAME_STATE_INVALID"}) {
            send(first);
            JsonNode response = first.next();
            assertThat(response.path("payload").path("code").asText()).isEqualTo(code);
            assertThat(response.toString()).doesNotContain("hand-");
        }
    }

    @Test
    void 경기조회실패는_예외내용을_숨기고_재조회가능하다() throws Exception {
        createHub(Optional.of(gateway));
        Peer first = peer(101L);
        when(gateway.load(101, "game-1")).thenThrow(new IllegalStateException("private-hand"))
                .thenReturn(Optional.of(view(101, "game-1")));
        send(first);
        JsonNode failure = first.next();
        assertThat(failure.path("payload").path("code").asText()).isEqualTo("GAME_STATE_UNAVAILABLE");
        assertThat(failure.toString()).doesNotContain("private-hand");
        send(first);
        assertThat(first.next().path("type").asText()).isEqualTo("GAME_STATE");
    }

    @Test
    void 복구미확정_참가자에게_개인상태를_주지않는다() throws Exception {
        createHub(Optional.of(gateway));
        when(reconnect.canControlGame(anyLong(), anyString(), anyString())).thenReturn(false);
        Peer first = peer(101L);
        when(gateway.load(101, "game-1")).thenReturn(Optional.of(view(101, "game-1")));
        send(first);
        JsonNode response = first.next();
        assertThat(response.path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
        assertThat(response.toString()).doesNotContain("hand-");
    }

    @Test
    void 느린조회는_다른연결을_막지않고_종료후응답은_새연결에_전달하지않는다() throws Exception {
        createHub(Optional.of(gateway));
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        when(gateway.load(101, "game-1")).thenAnswer(invocation -> {
            entered.countDown();
            try {
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return Optional.of(view(101, "game-1"));
            } finally {
                completed.countDown();
            }
        });
        Peer old = peer(101L);
        send(old);
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            send(old);
            assertThat(old.next().path("payload").path("code").asText()).isEqualTo("GAME_STATE_PENDING");
            Peer other = peer(202L);
            when(gateway.load(202, "game-1")).thenReturn(Optional.of(view(202, "game-1")));
            send(other);
            assertThat(other.next().path("type").asText()).isEqualTo("GAME_STATE");
            hub.disconnect(old.id);
            Peer returned = peer(101L);
            release.countDown();
            assertThat(completed.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(returned.messages.poll(200, TimeUnit.MILLISECONDS)).isNull();
            assertThat(old.messages).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    void 관전자_개인정보를_거절하고_JSON_변경으로_상태가_변하지않는다() {
        JsonNode publicState = mapper.createObjectNode().put("turn", 1);
        JsonNode privateState = mapper.createObjectNode().put("hand", "mine");
        assertThatThrownBy(() -> new GameStateView(101, "g", 1, Role.SPECTATOR, publicState, privateState))
                .isInstanceOf(IllegalArgumentException.class);
        GameStateView view = new GameStateView(101, "g", 1, Role.PLAYER, publicState, privateState);
        ((com.fasterxml.jackson.databind.node.ObjectNode) privateState).put("hand", "changed");
        ((com.fasterxml.jackson.databind.node.ObjectNode) view.privateState()).put("hand", "changed-again");
        assertThat(view.privateState().path("hand").asText()).isEqualTo("mine");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"gameId\":\"\"}", "{\"gameId\":123}",
            "{\"gameId\":\"g\",\"userId\":101}", "{\"gameId\":\"g\",\"role\":\"PLAYER\"}"})
    void 요청자가_사용자와_역할을_지정할수없다(String payload) {
        assertThatThrownBy(() -> new TableProtocol(mapper).parse(
                "{\"requestId\":\"id\",\"type\":\"GAME_STATE_CHECK\",\"payload\":" + payload + "}"))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    private GameStateView view(long userId, String gameId) {
        return new GameStateView(userId, gameId, 1, Role.PLAYER, mapper.createObjectNode().put("turn", 1),
                mapper.createObjectNode().put("hand", "hand-" + userId));
    }

    private void createHub(Optional<GameStateGateway> states) {
        when(reconnect.canControlGame(anyLong(), anyString(), anyString())).thenReturn(true);
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(reconnect),
                Duration.ofSeconds(60), Duration.ofSeconds(60),
                new WorldChannelRegistry(new WorldChannelProperties(null)), new WorldChatService(Duration.ofSeconds(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)), states);
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
            assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(userId, Provider.NAVER, TestLoginSessions.ID))).isTrue();
        }
        assertThat(peer.next().path("type").asText()).isEqualTo("CONNECTED");
        return peer;
    }

    private void send(Peer peer) throws Exception {
        hub.receive(peer.id, mapper.writeValueAsString(Map.of("requestId", "check", "type", "GAME_STATE_CHECK",
                "payload", Map.of("gameId", "game-1"))));
    }

    private record Peer(String id, BlockingQueue<JsonNode> messages) {
        JsonNode next() throws Exception {
            JsonNode next = messages.poll(5, TimeUnit.SECONDS);
            assertThat(next).isNotNull();
            return next;
        }
    }
}
