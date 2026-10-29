package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LegacyParkTableFlowTests {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void 두채널_전체16테이블이_설정_준비_시작_정산후_다음판까지_격리된다() {
        var starts = mock(CommittedGameStartService.class);
        var count = new AtomicInteger();
        when(starts.start(any())).thenAnswer(call ->
                GameStartResult.reserved(call.getArgument(0), "legacy-game-" + count.incrementAndGet()));
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            var hub = context.getBean(TableHub.class);
            // 실제 예약·엔진은 별도 계약이며 여기서는 32개 방의 공통 수명 주기를 검증한다.
            hub.configureCommittedStarts(Optional.of(starts));
            Peer first = peer(hub, 101);
            Peer second = peer(hub, 202);
            var rows = context.getBean(WorldMapRuntime.class).legacyTables().orElseThrow().entries();
            for (String channel : List.of("channel-1", "channel-2")) {
                first.request("CHANNEL_JOIN", Map.of("channelId", channel));
                second.request("CHANNEL_JOIN", Map.of("channelId", channel));
                var tables = rows.stream().filter(row -> row.channelId().equals(channel)).toList();
                assertThat(hub.listTables(channel).tables()).hasSize(16);
                for (int index = 0; index < tables.size(); index++) {
                    String tableId = tables.get(index).tableId();
                    first.request("TABLE_JOIN", Map.of("tableId", tableId));
                    second.request("TABLE_JOIN", Map.of("tableId", tableId));
                    for (int round = 0; round < 2; round++) {
                        String game = List.of("OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE").get(index % 4);
                        var settings = new java.util.HashMap<String, Object>();
                        settings.put("gameCode", game);
                        settings.put("selectedPlayers", 2);
                        settings.put("betAmountPerPlayer", 5);
                        settings.put("expectedVersion", first.state(tableId).path("version").asLong());
                        if (game.equals("DICE")) {
                            settings.put("targetScore", 4000);
                        }
                        assertThat(first.request("TABLE_CONFIGURE", settings).path("type").asText())
                                .isEqualTo("TABLE_STATE");
                        first.ready(tableId);
                        second.ready(tableId);
                        var start = first.request("TABLE_START", Map.of("actionId", UUID.randomUUID().toString(),
                                "expectedVersion", first.state(tableId).path("version").asLong())).path("payload");
                        assertThat(start.path("phase").asText()).as("시작 응답 %s", start)
                                .isIn("STARTING", "PLAYING");
                        String attempt = start.path("startAttemptId").asText();
                        var playing = first.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                                && message.path("payload").path("phase").asText().equals("PLAYING")
                                && message.path("payload").path("startAttemptId").asText().equals(attempt));
                        String gameId = playing.path("payload").path("gameSessionId").asText();
                        assertThat(gameId).startsWith("legacy-game-");
                        assertThat(hub.listTables(channel).tables().stream()
                                .filter(table -> !table.tableId().equals(tableId)))
                                .allSatisfy(table -> assertThat(table.occupiedSeats()).isZero());
                        String other = channel.equals("channel-1") ? "channel-2" : "channel-1";
                        assertThat(hub.listTables(other).tables())
                                .allSatisfy(table -> assertThat(table.occupiedSeats()).isZero());
                        hub.roundEnded(tableId, gameId);
                        hub.roundSettled(new GameResultCommitted(new GameResultView(101, 1, gameId, game,
                                GameResultView.Status.FINISHED, "NORMAL", GameResultView.SettlementStatus.SETTLED, 5,
                                List.of(new GameResultView.Participant("101", "WIN"),
                                        new GameResultView.Participant("202", "LOSE")), 5L, Instant.now())));
                        JsonNode waiting = first.state(tableId);
                        assertThat(waiting.path("gameId").isNull()).isTrue();
                        assertThat(first.request("GAME_START_CHECK", Map.of()).path("payload").path("phase").asText())
                                .isEqualTo("WAITING");
                        assertThat(waiting.path("selectorUserId").asText()).isEqualTo("101");
                        assertThat(hub.listTables(channel).tables().stream()
                                .filter(table -> table.tableId().equals(tableId)).findFirst().orElseThrow().readyCount())
                                .isZero();
                    }
                    first.request("TABLE_LEAVE", Map.of());
                    second.request("TABLE_LEAVE", Map.of());
                }
                first.request("CHANNEL_LEAVE", Map.of());
                second.request("CHANNEL_LEAVE", Map.of());
            }
            assertThat(count).hasValue(64);
        });
    }

    @Test
    void 시작연동이_꺼져있으면_착석자는_명확한_설정오류를_받는다() {
        runner().run(context -> {
            var hub = context.getBean(TableHub.class);
            Peer first = peer(hub, 101);
            first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            String tableId = hub.listTables("channel-1").tables().getFirst().tableId();
            first.request("TABLE_JOIN", Map.of("tableId", tableId));
            var result = first.request("GAME_START_CHECK", Map.of());
            assertThat(result.path("payload").path("code").asText()).isEqualTo("START_NOT_CONFIGURED");
            assertThat(hub.listTables("channel-1").tables().getFirst().occupiedSeats()).isEqualTo(1);
        });
    }

    @Test
    void 자동시작_연동이_없으면_전원준비_직후_참가자에게만_비활성을_알린다() {
        runner().run(context -> {
            var hub = context.getBean(TableHub.class);
            Peer first = peer(hub, 101);
            Peer second = peer(hub, 202);
            Peer other = peer(hub, 303);
            for (Peer player : List.of(first, second, other)) {
                player.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            }
            var tables = hub.listTables("channel-1").tables();
            String tableId = tables.getFirst().tableId();
            first.request("TABLE_JOIN", Map.of("tableId", tableId));
            second.request("TABLE_JOIN", Map.of("tableId", tableId));
            other.request("TABLE_JOIN", Map.of("tableId", tables.get(1).tableId()));
            first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 5));
            first.ready(tableId);
            first.assertNoStartUnavailable();
            second.assertNoStartUnavailable();

            second.ready(tableId);
            for (Peer player : List.of(first, second)) {
                JsonNode notice = player.await(Peer::isStartUnavailable);
                assertThat(notice.path("requestId").isNull()).isTrue();
                assertThat(notice.path("payload").path("message").asText()).contains("시작");
            }
            other.assertNoStartUnavailable();
            assertThat(first.state(tableId).path("allReady").asBoolean()).isTrue();
            assertThat(hub.listTables("channel-1").tables().stream()
                    .filter(table -> table.tableId().equals(tableId)).findFirst().orElseThrow().status())
                    .isEqualTo("WAITING");
            first.request("READY_SET", Map.of("ready", false));
            first.request("TABLE_LEAVE", Map.of());
            second.request("TABLE_LEAVE", Map.of());
        });
    }

    @Test
    void 산책자에게_의자설정과_실제참가활동만_보이고_지난경기사건은무시한다() {
        var starts = mock(CommittedGameStartService.class);
        var sequence = new AtomicInteger();
        when(starts.start(any())).thenAnswer(call -> GameStartResult.reserved(call.getArgument(0),
                "activity-game-" + sequence.incrementAndGet()));
        runner().run(context -> {
            var hub = context.getBean(TableHub.class);
            var world = context.getBean(com.ssafy.ontop.world.service.WorldChannelRegistry.class);
            hub.configureCommittedStarts(Optional.of(starts));
            Peer first = peer(hub, 101), second = peer(hub, 202), walker = peer(hub, 303);
            for (Peer peer : List.of(first, second, walker)) { peer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1")); }
            String table = hub.listTables("channel-1").tables().getFirst().tableId();
            first.state(table); second.state(table);
            for (int players : new int[]{2, 3, 4, 2}) {
                assertThat(first.request("TABLE_CONFIGURE", Map.of("gameCode", "ONE_CARD", "selectedPlayers", players,
                        "betAmountPerPlayer", 5, "expectedVersion", first.state(table).path("version").asLong()))
                        .path("type").asText()).isEqualTo("TABLE_STATE");
                assertThat(world.worldState("channel-1").tables().stream().filter(t -> t.tableId().equals(table))
                        .findFirst().orElseThrow().chairCount()).isEqualTo(players);
                assertThat(hub.listTables("channel-1").tables().getFirst().chairCount()).isEqualTo(players);
                long version = world.worldState("channel-1").version();
                walker.await(m -> m.path("type").asText().equals("WORLD_STATE")
                        && m.at("/payload/version").asLong() >= version
                        && m.at("/payload/tables").findValuesAsText("chairCount").contains(Integer.toString(players)));
            }
            assertThat(world.worldState("channel-1").avatars()).allSatisfy(a -> assertThat(a.activity()).isNull());
            String previous = null;
            for (int round = 1; round <= 2; round++) {
                first.ready(table); second.ready(table);
                first.request("TABLE_START", Map.of("actionId", "activity-" + round,
                        "expectedVersion", first.state(table).path("version").asLong()));
                String game = "activity-game-" + round;
                first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                        && m.at("/payload/gameSessionId").asText().equals(game)
                        && m.at("/payload/phase").asText().equals("PLAYING"));
                assertThat(world.worldState("channel-1").avatars().stream().filter(a -> !a.userId().equals("303")))
                        .allSatisfy(a -> assertThat(a.activity()).isEqualTo("GAME"));
                long startedVersion = world.worldState("channel-1").version();
                walker.await(m -> publicActivity(m, "101", "GAME", startedVersion));
                assertThat(world.worldState("channel-1").avatars().stream().filter(a -> a.userId().equals("303"))
                        .findFirst().orElseThrow().activity()).isNull();
                if (previous != null) {
                    hub.gameParticipantActivityEnded(new com.ssafy.ontop.game.result.GameParticipantLeft("old", previous,
                            table, "ONE_CARD", 1, 202, com.ssafy.ontop.game.result.GameDepartureReason.EXPLICIT_LEAVE, Instant.now()));
                    assertThat(world.worldState("channel-1").avatars().stream().filter(a -> a.userId().equals("202"))
                            .findFirst().orElseThrow().activity()).isEqualTo("GAME");
                }
                hub.gameParticipantActivityEnded(new com.ssafy.ontop.game.result.GameParticipantLeft("left-" + round, game,
                        table, "ONE_CARD", 2, 202, com.ssafy.ontop.game.result.GameDepartureReason.EXPLICIT_LEAVE, Instant.now()));
                assertThat(world.worldState("channel-1").avatars().stream().filter(a -> a.userId().equals("202"))
                        .findFirst().orElseThrow().activity()).isNull();
                assertThat(world.worldState("channel-1").avatars().stream().filter(a -> a.userId().equals("101"))
                        .findFirst().orElseThrow().activity()).isEqualTo("GAME");
                long leftVersion = world.worldState("channel-1").version();
                walker.await(m -> publicActivity(m, "202", null, leftVersion));
                hub.roundEnded(table, game);
                assertThat(world.worldState("channel-1").avatars()).allSatisfy(a -> assertThat(a.activity()).isNull());
                long endedVersion = world.worldState("channel-1").version();
                walker.await(m -> publicActivity(m, "101", null, endedVersion));
                hub.roundSettled(new GameResultCommitted(new GameResultView(101, 1, game, "ONE_CARD",
                        GameResultView.Status.FINISHED, "NORMAL", GameResultView.SettlementStatus.SETTLED, 5,
                        List.of(new GameResultView.Participant("101", "WIN"), new GameResultView.Participant("202", "FORFEIT")),
                        5L, Instant.now())));
                previous = game;
            }
            first.request("TABLE_LEAVE", Map.of()); second.request("TABLE_LEAVE", Map.of());
            assertThat(hub.listTables("channel-1").tables().getFirst().chairCount()).isEqualTo(2);
        });
    }

    @Test
    void 시작승인응답보다_먼저탈락한참가자의_게임활동은켜지않는다() {
        var reference = new java.util.concurrent.atomic.AtomicReference<TableHub>();
        var starts = mock(CommittedGameStartService.class);
        when(starts.start(any())).thenAnswer(call -> {
            com.ssafy.ontop.game.start.GameStartCommand command = call.getArgument(0);
            reference.get().gameParticipantActivityEnded(new com.ssafy.ontop.game.result.GameParticipantLeft(
                    "early-left", "early-game", command.tableId(), "ONE_CARD", 1, 202,
                    com.ssafy.ontop.game.result.GameDepartureReason.EXPLICIT_LEAVE, Instant.now()));
            return GameStartResult.reserved(command, "early-game");
        });
        runner().run(context -> {
            var hub = context.getBean(TableHub.class); reference.set(hub);
            hub.configureCommittedStarts(Optional.of(starts));
            Peer a = peer(hub, 101), b = peer(hub, 202), c = peer(hub, 303), walker = peer(hub, 404);
            for (Peer peer : List.of(a, b, c, walker)) { peer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1")); }
            String table = hub.listTables("channel-1").tables().getFirst().tableId();
            a.state(table); b.state(table); c.state(table);
            a.request("TABLE_CONFIGURE", Map.of("gameCode", "ONE_CARD", "selectedPlayers", 3,
                    "betAmountPerPlayer", 5, "expectedVersion", a.state(table).path("version").asLong()));
            a.ready(table); b.ready(table); c.ready(table);
            a.request("TABLE_START", Map.of("actionId", "early-start", "expectedVersion", a.state(table).path("version").asLong()));
            JsonNode state = walker.await(m -> publicActivity(m, "101", "GAME", 0));
            assertThat(publicActivity(state, "202", null, 0)).isTrue();
            assertThat(publicActivity(state, "303", "GAME", 0)).isTrue();
        });
    }

    private static boolean publicActivity(JsonNode message, String user, String activity, long version) {
        if (!message.path("type").asText().equals("WORLD_STATE") || message.at("/payload/version").asLong() < version) {
            return false;
        }
        for (JsonNode avatar : message.at("/payload/avatars")) {
            if (avatar.path("userId").asText().equals(user)) {
                return activity == null ? avatar.path("activity").isNull() : avatar.path("activity").asText().equals(activity);
            }
        }
        return false;
    }

    private org.springframework.boot.test.context.runner.WebApplicationContextRunner runner() {
        return WorldMapRuntimeConfigurationTests.runner().withPropertyValues(
                "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=A",
                "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=channel-2",
                "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=4",
                "ontop.websocket.heartbeat.interval=1m", "ontop.websocket.heartbeat.timeout=1m");
    }

    private Peer peer(TableHub hub, long userId) throws Exception {
        var session = mock(WebSocketSession.class);
        String id = UUID.randomUUID().toString();
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        var messages = new LinkedBlockingQueue<JsonNode>();
        doAnswer(call -> {
            if (call.getArgument(0) instanceof TextMessage text) {
                messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(userId,
                VerifiedWebSocketUser.Provider.NAVER, "00000000-0000-0000-0000-000000000001"))).isTrue();
        return new Peer(hub, id, messages);
    }

    private class Peer {
        private final TableHub hub;
        private final String id;
        private final BlockingQueue<JsonNode> messages;
        private final ArrayDeque<JsonNode> deferred = new ArrayDeque<>();

        Peer(TableHub hub, String id, BlockingQueue<JsonNode> messages) {
            this.hub = hub;
            this.id = id;
            this.messages = messages;
        }

        JsonNode state(String table) throws Exception {
            return request("TABLE_JOIN", Map.of("tableId", table)).path("payload");
        }

        void ready(String table) throws Exception {
            JsonNode state = state(table);
            assertThat(request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", 5,
                    "expectedVersion", state.path("version").asLong())).path("type").asText())
                    .isEqualTo("TABLE_STATE");
        }

        JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            return await(message -> message.path("requestId").asText().equals(requestId));
        }

        private static boolean isStartUnavailable(JsonNode message) {
            return message.path("type").asText().equals("ERROR")
                    && message.path("payload").path("code").asText().equals("START_NOT_CONFIGURED");
        }

        void assertNoStartUnavailable() throws InterruptedException {
            assertThat(deferred).noneMatch(Peer::isStartUnavailable);
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(150);
            long remaining;
            while ((remaining = deadline - System.nanoTime()) > 0) {
                JsonNode message = messages.poll(remaining, TimeUnit.NANOSECONDS);
                if (message == null) { break; }
                assertThat(isStartUnavailable(message)).isFalse();
                deferred.addLast(message);
            }
        }

        JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            var iterator = deferred.iterator();
            while (iterator.hasNext()) {
                JsonNode message = iterator.next();
                if (predicate.test(message)) {
                    iterator.remove();
                    return message;
                }
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            long remaining;
            while ((remaining = deadline - System.nanoTime()) > 0) {
                JsonNode message = messages.poll(remaining, TimeUnit.NANOSECONDS);
                if (message == null) {
                    break;
                }
                if (predicate.test(message)) {
                    return message;
                }
                deferred.addLast(message);
            }
            throw new AssertionError("요청한 테이블 메시지가 도착하지 않았습니다. 수신=" + deferred.stream()
                    .map(message -> message.path("type").asText() + "/" + message.path("payload").path("phase").asText()
                            + "/" + message.path("payload").path("code").asText()).distinct().toList());
        }
    }
}
