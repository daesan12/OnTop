package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateGateway;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GameWatchTests {

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
    void 관전허용후_공개상태만_구독하고_해제하면_새변경을_받지않는다() throws Exception {
        createHub();
        Peer watcher = peer(202L);
        Peer unrelated = peer(303L);
        AtomicLong version = new AtomicLong(8);
        when(states.load(202, "game-1")).thenAnswer(invocation -> Optional.of(view(202, "game-1", version.get())));
        watch(watcher, "start", "game-1");
        assertState(watcher.next(), "start", 8);
        version.set(9);
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        assertState(watcher.next(), null, 9);
        hub.gameStateChanged(new GameStateChanged("other", 9));
        send(watcher, "stop", "GAME_UNWATCH", Map.of());
        JsonNode left = watcher.next();
        assertThat(left.path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
        assertThat(left.path("requestId").asText()).isEqualTo("stop");
        hub.gameStateChanged(new GameStateChanged("game-1", 10));
        assertThat(watcher.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(unrelated.messages).isEmpty();
        verify(states, times(2)).load(202, "game-1");
        send(watcher, "again", "GAME_UNWATCH", Map.of());
        assertThat(code(watcher.next())).isEqualTo("GAME_NOT_WATCHING");
    }

    @Test
    void 개발사용자와_로비사용불가_사용자는_구독할수없다() throws Exception {
        createHub();
        Peer dev = peer(null);
        watch(dev, "dev", "game-1");
        assertThat(code(dev.next())).isEqualTo("GAME_STATE_AUTH_REQUIRED");
        Peer player = peer(101L);
        when(reconnect.canUseLobby(101, player.id)).thenReturn(false);
        watch(player, "blocked", "game-1");
        assertThat(code(player.next())).isEqualTo("GAME_RECOVERY_REQUIRED");
        verifyNoInteractions(states);
    }

    @ParameterizedTest
    @ValueSource(strings = {"denied", "user", "game", "player", "private", "exception"})
    void 관전권한이나_공개형식이_잘못되면_구독하지않고_개인정보를_숨긴다(String kind) throws Exception {
        createHub();
        Peer watcher = peer(202L);
        when(states.load(202, "game-1")).thenAnswer(invocation -> {
            if (kind.equals("denied")) {
                return Optional.empty();
            }
            if (kind.equals("exception")) {
                throw new IllegalStateException("secret-hand");
            }
            return Optional.of(new GameStateView(kind.equals("user") ? 101 : 202,
                    kind.equals("game") ? "other" : "game-1", 8,
                    kind.equals("player") ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    mapper.createObjectNode(), kind.equals("private") || kind.equals("player")
                            ? mapper.createObjectNode().put("hand", "secret-hand") : mapper.createObjectNode()));
        });
        watch(watcher, "start", "game-1");
        JsonNode response = watcher.next();
        assertThat(response.path("type").asText()).isEqualTo("ERROR");
        assertThat(response.path("requestId").asText()).isEqualTo("start");
        assertThat(response.toString()).doesNotContain("secret-hand");
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        assertThat(watcher.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        verify(states).load(202, "game-1");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 대기중관전해제는_지연결과를_폐기하고_다른경기_재구독을_보호한다(boolean lobbyAvailable) throws Exception {
        createHub();
        Peer watcher = peer(202L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(states.load(202, "game-1")).thenAnswer(invocation -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Optional.of(view(202, "game-1", 8));
        });
        when(states.load(202, "game-2")).thenReturn(Optional.of(view(202, "game-2", 4)));
        watch(watcher, "start", "game-1");
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            watch(watcher, "duplicate", "game-2");
            assertThat(code(watcher.next())).isEqualTo("GAME_ALREADY_WATCHING");
            send(watcher, "stop", "GAME_UNWATCH", Map.of());
            JsonNode cancelled = watcher.next();
            assertThat(cancelled.path("requestId").asText()).isEqualTo("start");
            assertThat(code(cancelled)).isEqualTo("GAME_WATCH_CANCELLED");
            assertThat(watcher.next().path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
            watch(watcher, "second", "game-2");
            // 취소해도 아직 실행 중인 엔진 호출이 끝날 때까지 새 조회는 대기한다.
            assertThat(watcher.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            verify(states, never()).load(202, "game-2");
            when(reconnect.canUseLobby(202, watcher.id)).thenReturn(lobbyAvailable);
            release.countDown();
            JsonNode resumed = watcher.next();
            if (lobbyAvailable) {
                assertState(resumed, "second", 4);
            } else {
                assertThat(resumed.path("requestId").asText()).isEqualTo("second");
                assertThat(code(resumed)).isEqualTo("GAME_RECOVERY_REQUIRED");
                send(watcher, "after", "GAME_UNWATCH", Map.of());
                assertThat(code(watcher.next())).isEqualTo("GAME_NOT_WATCHING");
                verify(states, never()).load(202, "game-2");
            }
            assertThat(watcher.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        } finally {
            release.countDown();
        }
    }

    @Test
    void 최초권한조회중_변경을_합쳐_최신상태로_관전을_시작한다() throws Exception {
        createHub();
        Peer watcher = peer(202L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(states.load(202, "game-1")).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                entered.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return Optional.of(view(202, "game-1", 8));
            }
            return Optional.of(view(202, "game-1", 10));
        });
        watch(watcher, "start", "game-1");
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.gameStateChanged(new GameStateChanged("game-1", 9));
            hub.gameStateChanged(new GameStateChanged("game-1", 10));
            release.countDown();
            assertState(watcher.next(), "start", 10);
            hub.gameStateChanged(new GameStateChanged("game-1", 9));
            assertThat(watcher.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            assertThat(calls.get()).isEqualTo(3);
        } finally {
            release.countDown();
        }
    }

    @ParameterizedTest
    @ValueSource(longs = {8, 9})
    void 관전권한회수는_오류를_알리고_구독을_제거한다(long eventVersion) throws Exception {
        createHub();
        Peer watcher = peer(202L);
        when(states.load(202, "game-1")).thenReturn(Optional.of(view(202, "game-1", 8)), Optional.empty());
        watch(watcher, "start", "game-1");
        assertState(watcher.next(), "start", 8);
        hub.gameStateChanged(new GameStateChanged("game-1", eventVersion));
        assertThat(code(watcher.next())).isEqualTo("GAME_STATE_ACCESS_DENIED");
        hub.gameStateChanged(new GameStateChanged("game-1", 10));
        assertThat(watcher.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        verify(states, times(2)).load(202, "game-1");
    }

    @Test
    void 끊긴관전연결의_응답은_같은계정_새연결에_전달하지않는다() throws Exception {
        createHub();
        Peer old = peer(202L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(states.load(202, "game-1")).thenAnswer(invocation -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Optional.of(view(202, "game-1", 8));
        });
        watch(old, "start", "game-1");
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.disconnect(old.id);
            Peer returned = peer(202L);
            release.countDown();
            assertThat(returned.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
            assertThat(old.messages).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    void 느린최초조회중_동일버전_권한회수도_다시검사한다() throws Exception {
        createHub();
        Peer watcher = peer(202L);
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(states.load(202, "game-1")).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                entered.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return Optional.of(view(202, "game-1", 8));
            }
            return Optional.empty();
        });
        watch(watcher, "start", "game-1");
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            hub.gameStateChanged(new GameStateChanged("game-1", 8));
            release.countDown();
            JsonNode response = watcher.next();
            assertThat(response.path("requestId").asText()).isEqualTo("start");
            assertThat(code(response)).isEqualTo("GAME_STATE_ACCESS_DENIED");
            assertThat(calls.get()).isEqualTo(2);
        } finally {
            release.countDown();
        }
    }

    @Test
    void 관전중_참가자가되면_관전을종료한뒤_본인참가상태로_전환한다() throws Exception {
        createHub();
        Peer watcher = peer(202L);
        when(states.load(202, "game-1")).thenReturn(Optional.of(view(202, "game-1", 8)),
                Optional.of(new GameStateView(202, "game-1", 9, GameStateView.Role.PLAYER,
                        mapper.createObjectNode(), mapper.createObjectNode().put("hand", "own-202"))));
        watch(watcher, "start", "game-1");
        assertState(watcher.next(), "start", 8);
        when(reconnect.canUseLobby(202, watcher.id)).thenReturn(false);
        when(reconnect.canControlGame(202, watcher.id, "game-1")).thenReturn(true);
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        assertThat(watcher.next().path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
        JsonNode participant = watcher.next();
        assertThat(participant.path("payload").path("role").asText()).isEqualTo("PLAYER");
        assertThat(participant.path("payload").path("privateState").path("hand").asText()).isEqualTo("own-202");
    }

    @Test
    void 경기복구로_로비사용이_막히면_성립한관전도_종료한다() throws Exception {
        createHub();
        Peer watcher = peer(202L);
        when(states.load(202, "game-1")).thenReturn(Optional.of(view(202, "game-1", 8)));
        watch(watcher, "start", "game-1");
        assertState(watcher.next(), "start", 8);
        when(reconnect.canUseLobby(202, watcher.id)).thenReturn(false);
        hub.gameStateChanged(new GameStateChanged("game-1", 9));
        assertThat(watcher.next().path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
        verify(states).load(202, "game-1");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"gameId\":123}", "{\"gameId\":\" \"}",
            "{\"gameId\":\"g\",\"userId\":101}", "{\"gameId\":\"g\",\"role\":\"PLAYER\"}"})
    void 관전요청에서_사용자와_권한을_위조할수없다(String payload) {
        assertThatThrownBy(() -> new TableProtocol(mapper).parse(
                "{\"requestId\":\"id\",\"type\":\"GAME_WATCH\",\"payload\":" + payload + "}"))
                .isInstanceOf(TableProtocol.RequestException.class);
    }

    private GameStateView view(long userId, String gameId, long version) {
        return new GameStateView(userId, gameId, version, GameStateView.Role.SPECTATOR,
                mapper.createObjectNode().put("turn", 101), mapper.createObjectNode());
    }

    private String code(JsonNode response) {
        return response.path("payload").path("code").asText();
    }

    private void assertState(JsonNode response, String requestId, long version) {
        assertThat(response.path("type").asText()).isEqualTo("GAME_STATE");
        if (requestId == null) {
            assertThat(response.path("requestId").isNull()).isTrue();
        } else {
            assertThat(response.path("requestId").asText()).isEqualTo(requestId);
        }
        assertThat(response.path("payload").path("role").asText()).isEqualTo("SPECTATOR");
        assertThat(response.path("payload").path("version").asLong()).isEqualTo(version);
        assertThat(response.path("payload").path("privateState").isEmpty()).isTrue();
    }

    private void createHub() {
        when(reconnect.canUseLobby(anyLong(), anyString())).thenReturn(true);
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(reconnect),
                Duration.ofSeconds(60), Duration.ofSeconds(60),
                new WorldChannelRegistry(new WorldChannelProperties(null)), new WorldChatService(Duration.ofSeconds(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)), Optional.of(states));
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

    private void watch(Peer peer, String requestId, String gameId) throws Exception {
        send(peer, requestId, "GAME_WATCH", Map.of("gameId", gameId));
    }

    private void send(Peer peer, String requestId, String type, Object payload) throws Exception {
        hub.receive(peer.id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
    }

    private record Peer(String id, BlockingQueue<JsonNode> messages) {
        JsonNode next() throws Exception {
            JsonNode next = messages.poll(5, TimeUnit.SECONDS);
            assertThat(next).isNotNull();
            return next;
        }
    }
}
