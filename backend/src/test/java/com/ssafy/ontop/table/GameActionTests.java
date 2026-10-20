package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GameActionTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final GameReconnectService reconnect = mock(GameReconnectService.class);
    private final GameActionGateway gateway = mock(GameActionGateway.class);
    private TableHub hub;

    @AfterEach
    void close() {
        if (hub != null) {
            hub.shutdown();
        }
    }

    @Test
    void 서버계정으로_전달하고_처리확인은_요청자에게만_보낸다() throws Exception {
        createHub(Optional.of(gateway));
        Peer player = peer(101L);
        Peer other = peer(202L);
        when(gateway.apply(any())).thenAnswer(invocation -> {
            GameActionCommand command = invocation.getArgument(0);
            assertThat(command.userId()).isEqualTo(101);
            assertThat(command.expectedVersion()).isEqualTo(8);
            assertThat(command.input().path("x").asInt()).isEqualTo(3);
            return result(command);
        });
        send(player);
        JsonNode response = player.next();
        assertThat(response.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
        assertThat(response.path("requestId").asText()).isEqualTo("request-1");
        assertThat(response.path("payload").path("version").asLong()).isEqualTo(9);
        assertThat(response.path("payload").has("userId")).isFalse();
        assertThat(response.path("payload").has("input")).isFalse();
        assertThat(other.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 개발사용자는_경기엔진을_호출하지않는다() throws Exception {
        createHub(Optional.of(gateway));
        Peer dev = peer(null);
        send(dev);
        assertThat(code(dev)).isEqualTo("GAME_ACTION_AUTH_REQUIRED");
        verifyNoInteractions(gateway);
    }

    @Test
    void 엔진_미등록은_성공으로_가장하지않는다() throws Exception {
        createHub(Optional.empty());
        Peer player = peer(101L);
        send(player);
        assertThat(code(player)).isEqualTo("GAME_ACTION_NOT_CONFIGURED");
    }

    @Test
    void 복구전_관전자_다른경기는_입력할수없다() throws Exception {
        createHub(Optional.of(gateway));
        Peer player = peer(101L);
        when(reconnect.canControlGame(101, player.id, "game-1")).thenReturn(false);
        send(player);
        assertThat(code(player)).isEqualTo("GAME_RECOVERY_REQUIRED");
        verifyNoInteractions(gateway);
    }

    @Test
    void 엔진의_확정거절과_결과불명_예외를_구분하고_내용은_숨긴다() throws Exception {
        createHub(Optional.of(gateway));
        Peer player = peer(101L);
        when(gateway.apply(any())).thenThrow(new GameActionGateway.Rejected(
                GameActionGateway.Rejection.NOT_YOUR_TURN));
        send(player);
        assertThat(code(player)).isEqualTo("GAME_ACTION_NOT_YOUR_TURN");
        doThrow(new IllegalStateException("secret-hand")).when(gateway).apply(any());
        send(player);
        JsonNode response = player.next();
        assertThat(response.path("payload").path("code").asText()).isEqualTo("GAME_ACTION_UNAVAILABLE");
        assertThat(response.toString()).doesNotContain("secret-hand");
    }

    @ParameterizedTest
    @ValueSource(strings = {"user", "game", "action", "version", "null"})
    void 엔진이_다른대상이나_잘못된결과를_주면_거절한다(String mismatch) throws Exception {
        createHub(Optional.of(gateway));
        Peer player = peer(101L);
        when(gateway.apply(any())).thenReturn(mismatch.equals("null") ? null : new GameActionResult(
                mismatch.equals("user") ? 202 : 101, mismatch.equals("game") ? "other" : "game-1",
                mismatch.equals("action") ? "other" : "action-1", mismatch.equals("version") ? 7 : 9));
        send(player);
        assertThat(code(player)).isEqualTo("GAME_ACTION_INVALID");
    }

    @Test
    void 느린입력은_다른사용자를_막지않고_이전연결_응답을_새연결에_보내지않는다() throws Exception {
        createHub(Optional.of(gateway));
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch completed = new CountDownLatch(1);
        when(gateway.apply(any())).thenAnswer(invocation -> {
            GameActionCommand command = invocation.getArgument(0);
            if (command.userId() == 101) {
                entered.countDown();
                try {
                    assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                } finally {
                    completed.countDown();
                }
            }
            return result(command);
        });
        Peer old = peer(101L);
        send(old);
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            send(old);
            assertThat(code(old)).isEqualTo("GAME_ACTION_PENDING");
            Peer other = peer(202L);
            send(other);
            assertThat(other.next().path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
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
    void 입력은_복사하여_외부변경을_막는다() {
        var input = mapper.createObjectNode().put("x", 3);
        GameActionCommand command = new GameActionCommand(101, "g", "a", 0, input);
        input.put("x", 9);
        ((com.fasterxml.jackson.databind.node.ObjectNode) command.input()).put("x", 10);
        assertThat(command.input().path("x").asInt()).isEqualTo(3);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"gameId\":\"g\",\"actionId\":\"a\",\"expectedVersion\":-1,\"input\":{}}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"expectedVersion\":1.1,\"input\":{}}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"expectedVersion\":9007199254740992,\"input\":{}}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"expectedVersion\":0,\"input\":[]}",
            "{\"gameId\":\"g\",\"actionId\":\"a\",\"expectedVersion\":0,\"input\":{},\"userId\":101}"})
    void 잘못된입력과_사용자위조를_거절한다(String payload) {
        assertThatThrownBy(() -> new TableProtocol(mapper).parse(
                "{\"requestId\":\"id\",\"type\":\"GAME_ACTION_SEND\",\"payload\":" + payload + "}"))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    private GameActionResult result(GameActionCommand command) {
        return new GameActionResult(command.userId(), command.gameId(), command.actionId(), 9);
    }

    private String code(Peer peer) throws Exception {
        return peer.next().path("payload").path("code").asText();
    }

    private void createHub(Optional<GameActionGateway> actions) {
        when(reconnect.canControlGame(anyLong(), anyString(), anyString())).thenReturn(true);
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(reconnect),
                Duration.ofSeconds(60), Duration.ofSeconds(60),
                new WorldChannelRegistry(new WorldChannelProperties(null)), new WorldChatService(Duration.ofSeconds(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)), Optional.empty(), actions);
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

    private void send(Peer peer) throws Exception {
        hub.receive(peer.id, mapper.writeValueAsString(Map.of("requestId", "request-1", "type", "GAME_ACTION_SEND",
                "payload", Map.of("gameId", "game-1", "actionId", "action-1", "expectedVersion", 8,
                        "input", Map.of("x", 3)))));
    }

    private record Peer(String id, BlockingQueue<JsonNode> messages) {
        JsonNode next() throws Exception {
            JsonNode next = messages.poll(5, TimeUnit.SECONDS);
            assertThat(next).isNotNull();
            return next;
        }
    }
}
