package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true",
        "ontop.games.omok.enabled=true", "server.address=127.0.0.1",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=8", "ontop.world.channels[1].channel-id=two",
        "ontop.world.channels[1].name=둘", "ontop.world.channels[1].capacity=8",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class,
        MemberAuthenticationFixture.class, FrozenWorldFixture.class, TableGameIdFlowTests.LifecycleFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TableGameIdFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            "one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private TableHub hub;
    @MockitoSpyBean private OmokEngine engine;
    @Autowired private OmokFlowTests.TestClock clock;
    @Autowired private WorldChannelRegistry positions;
    @Autowired private ApplicationEventPublisher events;
    @Autowired private CommittedStartFlowTests.ReservationDouble reservation;
    @Autowired private CommittedStartFlowTests.ResultStoreDouble results;
    @Autowired private LifecycleEvents lifecycle;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") private Clock oauthClock;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }

    @BeforeEach
    void accounts() {
        // These scenarios isolate chat/settlement from toss randomness; dedicated engine tests cover both coin faces.
        org.mockito.Mockito.doAnswer(call -> {
            engine.create(call.getArgument(0), call.getArgument(1), call.getArgument(2), call.getArgument(3));
            return null;
        }).when(engine).createWithCoinToss(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyLong());
        when(oauthClock.instant()).thenAnswer(invocation -> clock.instant());
        for (long id : List.of(101L, 202L, 505L, 606L)) {
            when(accounts.findActive(id, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                    id, VerifiedWebSocketUser.Provider.SSAFY, TestLoginSessions.ID)));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"COMMIT", "QUERY", "LOST_ACK"})
    void 수동기권부터_정산확인_다음판까지_중복이나과거알림으로_새경기를바꾸지않는다(String mode) throws Exception {
        var committed = new CountDownLatch(1);
        var releaseAck = new CountDownLatch(1);
        if (mode.equals("LOST_ACK")) {
            doAnswer(call -> {
                GameForfeitResult result = (GameForfeitResult) call.callRealMethod();
                if (!result.duplicate()) {
                    committed.countDown();
                    assertThat(releaseAck.await(8, TimeUnit.SECONDS)).isTrue();
                }
                return result;
            }).when(engine).forfeit(org.mockito.ArgumentMatchers.any(GameForfeitCommand.class));
        }
        try (var first = connect(101, "one"); var second = connect(202, "one");
                var viewer = connect(505, "one")) {
            pose(viewer, 1, 0);
            viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
            prepare(first, second);
            reservation.release.countDown();
            String gameId = publicState(viewer, "committed-test-game").path("gameId").asText();
            first.state("RESTORED");
            second.state("RESTORED");
            viewer.request("GAME_WATCH", Map.of("gameId", gameId));
            Map<String, String> command = Map.of("gameId", gameId, "actionId", "manual-button");
            ScenarioClient player = second;
            ScenarioClient returned = null;
            try {
                JsonNode acknowledgement;
                if (mode.equals("LOST_ACK")) {
                    second.sendRequest("GAME_FORFEIT", command);
                    assertThat(committed.await(5, TimeUnit.SECONDS)).isTrue();
                    second.close();
                    first.await(message -> message.path("type").asText().equals("CHANNEL_STATE")
                            && message.at("/payload/currentUsers").asInt() == 2);
                    returned = connect(202, "one", "FINISHED");
                    player = returned;
                    acknowledgement = player.request("GAME_FORFEIT", command);
                    assertThat(acknowledgement.at("/payload/duplicate").asBoolean()).isTrue();
                    releaseAck.countDown();
                } else {
                    acknowledgement = player.request("GAME_FORFEIT", command);
                    assertThat(acknowledgement.at("/payload/duplicate").asBoolean()).isFalse();
                }
                assertThat(acknowledgement.path("type").asText()).isEqualTo("GAME_FORFEIT_RESULT");
                player.state("FINISHED");
                assertThat(player.request("CHANNEL_JOIN", Map.of("channelId", "two"))
                        .at("/payload/code").asText()).isEqualTo("TABLE_BUSY");
                var ended = viewer.await(message -> message.path("type").asText().equals("GAME_STATE")
                        && message.at("/payload/publicState/status").asText().equals("FINISHED"));
                assertThat(ended.at("/payload/privateState").isEmpty()).isTrue();
                assertThat(ended.at("/payload/publicState/endReason").asText()).isEqualTo("EXPLICIT_LEAVE");
                assertThat(summary().path("status").asText()).isEqualTo("SETTLING");
                assertThat(summary().path("gameId").isNull()).isTrue();
                assertThat(summary().path("occupiedSeats").asInt()).isEqualTo(2);
                assertThat(summary().path("readyCount").asInt()).isZero();
                assertThat(player.request("READY_SET", Map.of("ready", true, "betAmountPerPlayer", 1, "expectedVersion", 0))
                        .at("/payload/code").asText()).isEqualTo("TABLE_BUSY");
                var pending = forfeitResult(202, gameId, GameResultView.SettlementStatus.PENDING);
                results.saved.put(202L, pending);
                var pendingReply = player.request("GAME_RESULT_CHECK", Map.of("gameSessionId", gameId));
                assertThat(pendingReply.at("/payload/settlementStatus").asText()).isEqualTo("PENDING");
                assertThat(pendingReply.at("/payload/myCoinDelta").isNull()).isTrue();
                assertThat(summary().path("status").asText()).isEqualTo("SETTLING");
                assertThat(viewer.request("GAME_RESULT_CHECK", Map.of("gameSessionId", gameId))
                        .at("/payload/code").asText()).isEqualTo("GAME_RESULT_ACCESS_DENIED");
                var settled = forfeitResult(202, gameId, GameResultView.SettlementStatus.SETTLED);
                results.saved.put(202L, settled);
                JsonNode settlement;
                if (mode.equals("QUERY")) {
                    settlement = player.request("GAME_RESULT_CHECK", Map.of("gameSessionId", gameId));
                } else {
                    events.publishEvent(new GameResultCommitted(settled));
                    settlement = player.await(message -> message.path("type").asText().equals("GAME_RESULT")
                            && message.at("/payload/settlementStatus").asText().equals("SETTLED"));
                }
                assertThat(settlement.at("/payload/myCoinDelta").asLong()).isEqualTo(-1);
                player.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                        && message.at("/payload/phase").asText().equals("WAITING"));
                assertThat(summary().path("status").asText()).isEqualTo("WAITING");
                first.request("TABLE_JOIN", Map.of("tableId", TABLE));
                first.request("READY_SET", Map.of("ready", true));
                assertThat(reservation.starts).hasValue(1);
                assertThat(summary().path("readyCount").asInt()).isEqualTo(1);
                player.request("TABLE_JOIN", Map.of("tableId", TABLE));
                player.request("READY_SET", Map.of("ready", true));
                var next = publicState(viewer, "committed-test-game-2");
                first.state("RESTORED");
                player.state("RESTORED");
                assertThat(player.request("GAME_FORFEIT", command).at("/payload/code").asText())
                        .isEqualTo("GAME_RECOVERY_REQUIRED");
                events.publishEvent(new GameResultCommitted(settled));
                hub.roundEnded(TABLE, gameId);
                assertThat(summary().path("gameId").asText()).isEqualTo("committed-test-game-2");
                assertThat(summary().path("status").asText()).isEqualTo("PLAYING");
                assertThat(first.request("GAME_ACTION_SEND", Map.of("gameId", "committed-test-game-2",
                        "actionId", "next-round-move", "expectedVersion", 0, "input", Map.of("x", 7, "y", 7)))
                        .path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
                assertThat(reservation.reservations).hasValue(2);
                assertThat(lifecycle.left).hasSize(1);
                assertThat(lifecycle.finished).hasSize(1);
                assertThat(lifecycle.finished.getFirst().participants().stream()
                        .filter(participant -> participant.userId() == 202).findFirst().orElseThrow().result())
                        .isEqualTo(GameFinished.Result.FORFEIT);
                Files.writeString(Path.of("build/forfeit-next-round-" + mode + ".json"), mapper
                        .writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("mode", mode,
                                "acknowledgement", acknowledgement, "ended", ended, "pending", pendingReply,
                                "settlement", settlement, "nextRound", next)));
            } finally {
                releaseAck.countDown();
                if (returned != null) { returned.close(); }
            }
        }
    }

    private GameResultView forfeitResult(long userId, String gameId, GameResultView.SettlementStatus status) {
        return new GameResultView(userId, status == GameResultView.SettlementStatus.PENDING ? 1 : 2,
                gameId, "OMOK", GameResultView.Status.FINISHED, "EXPLICIT_LEAVE", status, 1,
                List.of(new GameResultView.Participant("101", "WIN"),
                        new GameResultView.Participant("202", "FORFEIT")),
                status == GameResultView.SettlementStatus.PENDING ? null : -1L, clock.instant());
    }

    @Test
    void 경기ID로_관전하고_종료와_다음판까지_같은_테이블에서_갱신한다() throws Exception {
        try (var first = connect(101, "one"); var second = connect(202, "one");
                var viewer = connect(505, "one"); var outside = connect(606, "two")) {
            pose(viewer, 1, 0);
            assertThat(summary().path("gameId").isNull()).isTrue();
            assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE))
                    .at("/payload/gameId").isNull()).isTrue();
            prepare(first, second);
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            var pending = viewer.request("TABLE_WATCH", Map.of("tableId", TABLE)).path("payload");
            assertThat(pending.path("gameId").isNull()).isTrue();
            assertThat(summary().path("gameId").isNull()).isTrue();

            reservation.release.countDown();
            var playing = publicState(viewer, "committed-test-game");
            var participant = first.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.at("/payload/gameId").asText().equals("committed-test-game")).path("payload");
            assertThat(participant).isEqualTo(playing);
            assertThat(playing.path("version").asLong()).isGreaterThan(pending.path("version").asLong());
            String gameId = playing.path("gameId").asText();
            assertThat(summary().path("gameId").asText()).isEqualTo(gameId);
            var watched = viewer.request("GAME_WATCH", Map.of("gameId", gameId));
            assertThat(watched.path("type").asText()).isEqualTo("GAME_STATE");
            assertThat(watched.at("/payload/role").asText()).isEqualTo("SPECTATOR");
            assertThat(watched.at("/payload/privateState").isEmpty()).isTrue();
            assertThat(playing.toString()).doesNotContain("startAttemptId", "gameSessionId", "reserved", "privateState");
            assertThat(outside.request("GAME_WATCH", Map.of("gameId", gameId))
                    .at("/payload/code").asText()).isEqualTo("GAME_STATE_ACCESS_DENIED");

            viewer.request("GAME_UNWATCH", Map.of());
            pose(viewer, 2, 20.001);
            assertThat(viewer.request("GAME_WATCH", Map.of("gameId", gameId))
                    .at("/payload/code").asText()).isEqualTo("GAME_STATE_ACCESS_DENIED");
            pose(viewer, 3, 20);
            assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE))
                    .at("/payload/gameId").asText()).isEqualTo(gameId);

            clock.advanceSeconds(30);
            engine.tick();
            var ended = viewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE")
                    && message.at("/payload/gameId").isNull()
                    && message.at("/payload/version").asLong() > playing.path("version").asLong()).path("payload");
            assertThat(summary().path("status").asText()).isEqualTo("SETTLING");
            assertThat(summary().path("gameId").isNull()).isTrue();
            assertThat(ended.path("allReady").asBoolean()).isFalse();
            events.publishEvent(new GameResultCommitted(new GameResultView(101, 2, gameId, "OMOK",
                    GameResultView.Status.FINISHED, "TURN_TIMEOUT", GameResultView.SettlementStatus.SETTLED, 1,
                    List.of(new GameResultView.Participant("101", "LOSE"),
                            new GameResultView.Participant("202", "WIN")), -1L, clock.instant())));
            assertThat(summary().path("status").asText()).isEqualTo("WAITING");
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            var next = publicState(viewer, "committed-test-game-2");
            hub.roundEnded(TABLE, gameId);
            assertThat(summary().path("gameId").asText()).isEqualTo("committed-test-game-2");
            assertThat(next.path("version").asLong()).isGreaterThan(ended.path("version").asLong());
            Files.writeString(Path.of("build/table-game-id-verification.json"),
                    mapper.writerWithDefaultPrettyPrinter().writeValueAsString(
                            Map.of("pending", pending, "playing", playing, "watchResponse", watched,
                                    "ended", ended, "nextRound", next)));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"REJECT", "INVALID", "UNKNOWN"})
    void 거절_위조_응답유실은_공개경기ID를_만들지_않는다(String mode) throws Exception {
        reservation.mode = mode;
        try (var first = connect(101, "one"); var second = connect(202, "one");
                var viewer = connect(505, "one")) {
            pose(viewer, 1, 0);
            viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
            prepare(first, second);
            reservation.release.countDown();
            String code = switch (mode) {
                case "REJECT" -> "START_REJECTED";
                case "INVALID" -> "START_RESULT_INVALID";
                default -> "START_RESULT_UNKNOWN";
            };
            first.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.at("/payload/code").asText().equals(code));
            assertThat(summary().path("gameId").isNull()).isTrue();
            assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE))
                    .at("/payload/gameId").isNull()).isTrue();
            if (mode.equals("UNKNOWN")) {
                first.request("GAME_START_CHECK", Map.of());
                assertThat(publicState(viewer, "committed-test-game").path("gameId").asText())
                        .isEqualTo("committed-test-game");
                assertThat(reservation.starts).hasValue(1);
            }
        }
    }

    @Test
    void 엔진이_생성직후_끝나면_끝난경기ID를_관전자에게_잠깐도_공개하지_않는다() throws Exception {
        doAnswer(call -> {
            Object value = call.callRealMethod();
            clock.advanceSeconds(30);
            engine.tick();
            events.publishEvent(new GameResultCommitted(new GameResultView(101, 2, "committed-test-game", "OMOK",
                    GameResultView.Status.FINISHED, "TURN_TIMEOUT", GameResultView.SettlementStatus.SETTLED, 1,
                    List.of(new GameResultView.Participant("101", "LOSE"),
                            new GameResultView.Participant("202", "WIN")), -1L, clock.instant())));
            return value;
        }).when(engine).create(anyString(), anyString(), anyLong(), anyLong());
        try (var first = connect(101, "one"); var second = connect(202, "one");
                var viewer = connect(505, "one")) {
            pose(viewer, 1, 0);
            viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
            viewer.assertNoMessageDuring(message -> message.path("type").asText().equals("TABLE_WATCH_STATE")
                    && !message.at("/payload/gameId").isNull(), () -> {
                        prepare(first, second);
                        reservation.release.countDown();
                        first.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                                && message.at("/payload/phase").asText().equals("WAITING")
                                && message.at("/payload/gameSessionId").asText().equals("committed-test-game"));
                        assertThat(summary().path("gameId").isNull()).isTrue();
                        assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", TABLE))
                                .at("/payload/gameId").isNull()).isTrue();
                        return null;
                    });
        }
    }

    private void prepare(ScenarioClient first, ScenarioClient second) throws Exception {
        first.request("TABLE_JOIN", Map.of("tableId", TABLE));
        second.request("TABLE_JOIN", Map.of("tableId", TABLE));
        first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
    }

    private void pose(ScenarioClient client, long sequence, double x) {
        // 서버 승인 위치 fixture. 클라이언트 좌표 주입 API는 만들지 않는다.
        positions.move(client.userId, new WorldChannelRegistry.Position(sequence, x, .8, 0, 0));
    }

    private JsonNode publicState(ScenarioClient viewer, String gameId) throws Exception {
        return viewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE")
                && message.at("/payload/gameId").asText().equals(gameId)).path("payload");
    }

    private JsonNode summary() throws Exception {
        var response = request("GET", "/api/v1/tables?channelId=one", 505);
        assertThat(response.statusCode()).isEqualTo(200);
        for (JsonNode table : mapper.readTree(response.body()).path("tables")) {
            if (table.path("tableId").asText().equals(TABLE)) {
                return table;
            }
        }
        throw new AssertionError("검증 테이블이 목록에 없습니다.");
    }

    private ScenarioClient connect(long id, String channel) throws Exception {
        return connect(id, channel, "LOBBY");
    }

    private ScenarioClient connect(long id, String channel, String status) throws Exception {
        var response = request("POST", "/api/v1/auth/websocket-ticket", id);
        assertThat(response.statusCode()).isEqualTo(200);
        var client = new ScenarioClient(port, Long.toString(id), mapper.readTree(response.body()).path("ticket").asText());
        client.state(status);
        var joined = client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        assertThat(joined.path("type").asText()).as("채널 입장 응답: %s", joined)
                .isEqualTo("CHANNEL_STATE");
        return client;
    }

    private HttpResponse<String> request(String method, String path, long id) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .header("Authorization", "Bearer " + jwt.issue(id, TestLoginSessions.ID))
                    .method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class LifecycleFixture {
        @Bean LifecycleEvents lifecycleEvents() { return new LifecycleEvents(); }
    }

    static class LifecycleEvents {
        final List<GameParticipantLeft> left = new CopyOnWriteArrayList<>();
        final List<GameFinished> finished = new CopyOnWriteArrayList<>();
        @EventListener public void left(GameParticipantLeft event) { left.add(event); }
        @EventListener public void finished(GameFinished event) { finished.add(event); }
    }
}
