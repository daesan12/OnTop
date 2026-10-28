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
