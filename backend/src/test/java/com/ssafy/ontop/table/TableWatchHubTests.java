package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableWatchHubTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10),
            new WorldChannelRegistry(new WorldChannelProperties(List.of(
                    new Channel("one", "하나", 8), new Channel("two", "둘", 8)))),
            new com.ssafy.ontop.world.service.WorldChatService(Duration.ofSeconds(1)),
            new com.ssafy.ontop.world.service.WorldEmoteService(
                    new com.ssafy.ontop.world.config.WorldEmoteProperties(null), Duration.ofSeconds(1)),
            Optional.empty(), Optional.empty(), Optional.empty(), AllowedWatchFixture.allowed());

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 구독자는_좌석을_차지하지_않고_선택과_준비의_공개_상태만_받는다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer viewer = peer();
        first.join("one");
        second.join("one");
        viewer.join("one");
        String table = table("one", 0);
        JsonNode before = mapper.valueToTree(hub.listTables("one"));
        JsonNode initial = viewer.request("TABLE_WATCH", Map.of("tableId", table));
        assertThat(initial.path("type").asText()).isEqualTo("TABLE_WATCH_STATE");
        assertThat(mapper.<JsonNode>valueToTree(hub.listTables("one"))).isEqualTo(before);
        first.request("TABLE_JOIN", Map.of("tableId", table));
        assertThat(viewer.nextWatch().path("payload").path("seats").get(0).path("userId").asText())
                .isEqualTo(first.userId);
        first.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
        assertThat(viewer.nextWatch().path("payload").path("gameCode").asText()).isEqualTo("OMOK");
        second.request("TABLE_JOIN", Map.of("tableId", table));
        viewer.nextWatch();
        first.request("READY_SET", Map.of("ready", true));
        viewer.nextWatch();
        second.request("READY_SET", Map.of("ready", true));
        JsonNode ready = viewer.nextWatch().path("payload");
        assertThat(ready.path("allReady").asBoolean()).isTrue();
        assertThat(ready.path("seats").size()).isEqualTo(2);
        assertThat(ready.has("gameSessionId")).isFalse();
        assertThat(viewer.request("READY_SET", Map.of("ready", true)).path("payload").path("code").asText())
                .isEqualTo("NOT_SEATED");
        assertThat(viewer.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000))
                .path("payload").path("code").asText()).isEqualTo("NOT_SEATED");
    }

    @Test
    void 채널과_테이블을_격리하고_같은_구독_반복은_상태를_바꾸지_않는다() throws Exception {
        Peer player = peer();
        Peer viewer = peer();
        Peer other = peer();
        Peer outside = peer();
        String table = table("one", 0);
        assertCode(outside.request("TABLE_WATCH", Map.of("tableId", table)), "NOT_IN_CHANNEL");
        player.join("one");
        viewer.join("one");
        other.join("two");
        assertCode(other.request("TABLE_WATCH", Map.of("tableId", table)), "TABLE_CHANNEL_MISMATCH");
        assertCode(viewer.request("TABLE_WATCH", Map.of("tableId", "missing")), "TABLE_NOT_FOUND");
        JsonNode initial = viewer.request("TABLE_WATCH", Map.of("tableId", table));
        assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", table)).path("payload"))
                .isEqualTo(initial.path("payload"));
        assertCode(viewer.request("TABLE_WATCH", Map.of("tableId", table("one", 1))), "ALREADY_WATCHING");
        other.request("TABLE_WATCH", Map.of("tableId", table("two", 0)));
        player.request("TABLE_JOIN", Map.of("tableId", table));
        viewer.nextWatch();
        other.noWatch();
        outside.noWatch();
        assertCode(player.request("TABLE_WATCH", Map.of("tableId", table)), "TABLE_BUSY");
    }

    @Test
    void 명시적_구독_종료와_채널_퇴장은_이전_테이블_알림을_끊는다() throws Exception {
        Peer player = peer();
        Peer viewer = peer();
        player.join("one");
        viewer.join("one");
        String table = table("one", 0);
        viewer.request("TABLE_WATCH", Map.of("tableId", table));
        assertThat(viewer.request("TABLE_UNWATCH", Map.of()).path("type").asText()).isEqualTo("TABLE_WATCH_LEFT");
        assertCode(viewer.request("TABLE_UNWATCH", Map.of()), "NOT_WATCHING");
        player.request("TABLE_JOIN", Map.of("tableId", table));
        viewer.noWatch();
        viewer.request("TABLE_WATCH", Map.of("tableId", table));
        viewer.request("CHANNEL_LEAVE", Map.of());
        assertThat(viewer.seen.stream().filter(m -> m.path("type").asText().equals("TABLE_WATCH_LEFT")))
                .hasSize(2);
        viewer.join("two");
        player.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
        viewer.noWatch();
        assertCode(viewer.request("TABLE_UNWATCH", Map.of()), "NOT_WATCHING");
    }

    @Test
    void 성공_착석은_구독을_끝내고_이후_참가자_상태만_한_번_받는다() throws Exception {
        Peer viewer = peer();
        Peer player = peer();
        viewer.join("one");
        player.join("one");
        String table = table("one", 0);
        viewer.request("TABLE_WATCH", Map.of("tableId", table));
        JsonNode joined = viewer.request("TABLE_JOIN", Map.of("tableId", table));
        assertThat(joined.path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(viewer.seen.stream().filter(m -> m.path("type").asText().equals("TABLE_WATCH_LEFT")))
                .hasSize(1);
        assertCode(viewer.request("TABLE_UNWATCH", Map.of()), "NOT_WATCHING");
        player.request("TABLE_JOIN", Map.of("tableId", table));
        assertThat(viewer.next("TABLE_STATE").path("requestId").isNull()).isTrue();
        viewer.noWatch();
    }

    @Test
    void 만석_착석_거절은_구독을_보존하며_참가자_퇴장도_반영한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer viewer = peer();
        first.join("one");
        second.join("one");
        viewer.join("one");
        String table = table("one", 0);
        first.request("TABLE_JOIN", Map.of("tableId", table));
        first.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
        second.request("TABLE_JOIN", Map.of("tableId", table));
        viewer.request("TABLE_WATCH", Map.of("tableId", table));
        assertCode(viewer.request("TABLE_JOIN", Map.of("tableId", table)), "TABLE_FULL");
        first.request("READY_SET", Map.of("ready", true));
        assertThat(viewer.nextWatch().path("payload").path("seats").get(0).path("ready").asBoolean()).isTrue();
        second.request("TABLE_LEAVE", Map.of());
        assertThat(viewer.nextWatch().path("payload").path("seats").get(0).path("ready").asBoolean()).isFalse();
    }

    @Test
    void 구독_연결_종료는_다른_구독과_좌석을_건드리지_않는다() throws Exception {
        Peer player = peer();
        Peer viewer = peer();
        Peer remaining = peer();
        player.join("one");
        viewer.join("one");
        remaining.join("one");
        String table = table("one", 0);
        player.request("TABLE_JOIN", Map.of("tableId", table));
        viewer.request("TABLE_WATCH", Map.of("tableId", table));
        remaining.request("TABLE_WATCH", Map.of("tableId", table));
        hub.disconnect(viewer.id);
        hub.disconnect(viewer.id);
        player.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
        assertThat(remaining.nextWatch().path("payload").path("gameCode").asText()).isEqualTo("OMOK");
        viewer.noWatch();
        assertThat(hub.listTables("one").tables().getFirst().occupiedSeats()).isEqualTo(1);
    }

    @Test
    void 구독자는_시작_참가자에_포함되지_않고_시작_세션_응답도_받지_않는다() throws Exception {
        hub.shutdown();
        BlockingQueue<GameStartCommand> commands = new LinkedBlockingQueue<>();
        GameStartGateway gateway = mock(GameStartGateway.class);
        when(gateway.startGame(any())).thenAnswer(invocation -> {
            GameStartCommand command = invocation.getArgument(0);
            commands.add(command);
            return GameStartResult.reserved(command, "demo-session");
        });
        hub = new TableHub(mapper, Optional.of(gateway), true, Optional.empty(),
                Duration.ofSeconds(10), Duration.ofSeconds(10),
                new WorldChannelRegistry(new WorldChannelProperties(null)),
                new com.ssafy.ontop.world.service.WorldChatService(Duration.ofSeconds(1)),
                new com.ssafy.ontop.world.service.WorldEmoteService(
                        new com.ssafy.ontop.world.config.WorldEmoteProperties(null), Duration.ofSeconds(1)),
                Optional.empty(), Optional.empty(), Optional.empty(), AllowedWatchFixture.allowed());
        Peer first = peer();
        Peer second = peer();
        Peer viewer = peer();
        viewer.request("TABLE_WATCH", Map.of("tableId", "table-1"));
        viewer.seen.clear();
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
        JsonNode start;
        do {
            start = first.next("GAME_START_STATE");
        } while (!start.path("payload").path("phase").asText().equals("CONFIRMED"));
        GameStartCommand command = commands.poll(5, TimeUnit.SECONDS);
        assertThat(command).isNotNull();
        assertThat(command.participants()).extracting(GameStartCommand.Participant::userId)
                .containsExactly(first.userId, second.userId);
        viewer.request("TABLE_WATCH", Map.of("tableId", "table-1"));
        assertThat(viewer.seen).noneMatch(message -> message.path("type").asText().equals("GAME_START_STATE"));
    }

    @Test
    void 경기_복구_제한은_구독에도_그대로_적용한다() throws Exception {
        hub.shutdown();
        GameReconnectService recovery = mock(GameReconnectService.class);
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(recovery));
        Peer viewer = peer(101L);
        assertCode(viewer.request("TABLE_WATCH", Map.of("tableId", "table-1")), "GAME_RECOVERY_REQUIRED");
    }

    private String table(String channel, int index) {
        return hub.listTables(channel).tables().get(index).tableId();
    }

    private void assertCode(JsonNode message, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.path("payload").path("code").asText()).isEqualTo(code);
    }

    private Peer peer() throws Exception {
        return peer(null);
    }

    private Peer peer(Long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        if (accountId == null) hub.connect(session);
        else hub.connectAuthenticated(session, new VerifiedWebSocketUser(accountId, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID));
        peer.userId = peer.next("CONNECTED").path("payload").path("userId").asText();
        return peer;
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private final List<JsonNode> seen = new ArrayList<>();
        private String userId;

        private void join(String channel) throws Exception {
            request("CHANNEL_JOIN", Map.of("channelId", channel));
            next("WORLD_STATE");
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            return await("requestId", requestId);
        }

        private JsonNode nextWatch() throws Exception {
            return next("TABLE_WATCH_STATE");
        }

        private JsonNode next(String type) throws Exception {
            return await("type", type);
        }

        private JsonNode await(String field, String value) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                JsonNode message = messages.poll(100, TimeUnit.MILLISECONDS);
                if (message != null) {
                    seen.add(message);
                    if (message.path(field).asText().equals(value)) return message;
                }
            }
            throw new AssertionError("응답 없음: " + field + "=" + value);
        }

        private void noWatch() throws Exception {
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(200);
            while (System.nanoTime() < deadline) {
                JsonNode message = messages.poll(20, TimeUnit.MILLISECONDS);
                if (message != null) assertThat(message.path("type").asText()).isNotEqualTo("TABLE_WATCH_STATE");
            }
        }
    }
}
