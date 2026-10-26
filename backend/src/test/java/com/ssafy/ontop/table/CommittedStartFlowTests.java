package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView.SettlementStatus;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true",
        "ontop.games.omok.enabled=true", "ontop.games.farkle.enabled=true", "ontop.websocket.heartbeat.interval=200ms",
        "ontop.websocket.heartbeat.timeout=2s",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class, com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class CommittedStartFlowTests {
    private static final String GAME = "committed-test-game";
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean OmokEngine engine;
    @Autowired com.ssafy.ontop.game.farkle.service.FarkleEngine dice;
    @Autowired ReservationDouble reservation;
    @Autowired OmokFlowTests.TestClock clock;
    @Autowired TableHub hub;
    @Autowired ResultStoreDouble results;
    @Autowired ApplicationEventPublisher events;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") Clock oauthClock;

    @BeforeEach
    void accounts() {
        when(oauthClock.instant()).thenAnswer(invocation -> clock.instant());
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(accounts.findActive(202, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(202,
                VerifiedWebSocketUser.Provider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void 확정전미시작_성공후착수_중복조회와재접속은재예약하지않는다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(engine.load(101, GAME)).isEmpty();
            assertThat(first.request("TABLE_LEAVE", Map.of()).path("payload").path("code").asText())
                    .isEqualTo("TABLE_BUSY");
            reservation.release.countDown();
            playing(first);
            first.state("RESTORED");
            second.state("RESTORED");
            var action = first.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "first-move",
                    "expectedVersion", 0, "input", Map.of("x", 7, "y", 7)));
            assertThat(action.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            assertThat(engine.load(101, GAME).orElseThrow().version()).isEqualTo(1);
            assertThat(first.request("GAME_START_CHECK", Map.of()).path("payload").path("phase").asText())
                    .isEqualTo("PLAYING");
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            try (var returned = connect(202, "RESTORED")) {
                assertThat(returned.request("GAME_STATE_CHECK", Map.of("gameId", GAME))
                        .path("payload").path("version").asLong()).isEqualTo(1);
            }
            assertThat(reservation.starts.get()).isEqualTo(1);
            assertThat(reservation.reservations.get()).isEqualTo(1);
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("PLAYING");
        }
    }

    @Test
    void 확정거절은전원준비를초기화하고엔진을생성하지않는다() throws Exception {
        reservation.mode = "REJECT";
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            reservation.release.countDown();
            var rejected = first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("code").asText().equals("START_REJECTED"));
            assertThat(rejected.path("payload").path("phase").asText()).isEqualTo("WAITING");
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
            assertThat(engine.load(101, GAME)).isEmpty();
            assertThat(reservation.reservations.get()).isZero();
        }
    }

    @Test
    void 커밋후응답유실은같은시도조회로복구하고다시예약하지않는다() throws Exception {
        reservation.mode = "UNKNOWN";
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            reservation.release.countDown();
            first.await(m -> m.path("payload").path("code").asText().equals("START_RESULT_UNKNOWN"));
            assertThat(engine.load(101, GAME)).isEmpty();
            first.request("GAME_START_CHECK", Map.of());
            playing(first);
            first.state("RESTORED");
            assertThat(reservation.starts.get()).isEqualTo(1);
            assertThat(reservation.lookups.get()).isEqualTo(1);
            assertThat(reservation.reservations.get()).isEqualTo(1);
        }
    }

    @Test
    void 잘못된확정금액은엔진시작으로바꾸지않는다() throws Exception {
        reservation.mode = "INVALID";
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            reservation.release.countDown();
            first.await(m -> m.path("payload").path("code").asText().equals("START_RESULT_INVALID"));
            assertThat(engine.load(101, GAME)).isEmpty();
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("STARTING");
        }
    }

    @Test
    void 목표없는주사위선택은예약요청전에거절한다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            assertThat(first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "DICE"))
                    .path("payload").path("code").asText()).isEqualTo("GAME_OPTIONS_REQUIRED");
            assertThat(reservation.starts.get()).isZero();
            assertThat(reservation.reservations.get()).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 예약확정대기중끊겨도원래단절시각의복귀유예를유지한다(int seconds) throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(seconds);
            reservation.release.countDown();
            playing(first);
            try (var returned = connect(202, seconds == 29 ? "RESTORED" : "FINISHED")) {
                assertThat(reservation.reservations.get()).isEqualTo(1);
                assertThat(returned.request("GAME_START_CHECK", Map.of()).path("type").asText())
                        .isEqualTo("GAME_START_STATE");
            }
        }
    }

    @Test
    void 확정_경기_시작은_참가자마다_행동_로그를_남긴다() throws Exception {
        List<BehaviorEvent> started = new CopyOnWriteArrayList<>();
        hub.configureBehaviorLog(new BehaviorLog() {
            @Override public void record(Supplier<BehaviorEvent> event) {
                BehaviorEvent value = event.get();
                if (value.type() == BehaviorEventType.GAME_STARTED) { started.add(value); }
            }
            @Override public void recordPosition(Supplier<PositionSample> sample) { }
        });

        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            reservation.release.countDown();
            playing(first);
        }

        assertThat(started).extracting(BehaviorEvent::userId).containsExactlyInAnyOrder(101L, 202L);
        assertThat(started).allSatisfy(event -> {
            assertThat(event.gameId()).isEqualTo(GAME);
            assertThat(event.tableId()).isEqualTo("table-1");
            assertThat(event.props()).containsEntry("gameCode", "OMOK").containsEntry("players", 2);
        });
    }

    @Test
    void 실제소켓의_다섯코인_설정과_예약요청과_정산확인이_같은금액을_사용한다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            assertThat(first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 5))
                    .path("payload").path("betAmountPerPlayer").asLong()).isEqualTo(5);
            first.request("READY_SET", Map.of("ready", true)); second.request("READY_SET", Map.of("ready", true));
            reservation.release.countDown(); playing(first);
            assertThat(reservation.committed.reservedAmountPerPlayer()).isEqualTo(5);
            assertThat(reservation.committed.totalReservedAmount()).isEqualTo(10);
            assertThat(first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 9))
                    .path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(hub.listTables().tables().getFirst().betAmountPerPlayer()).isEqualTo(5);
            clock.advanceSeconds(30); engine.tick();
            first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("phase").asText().equals("SETTLING"));
            var stored = result(101, SettlementStatus.SETTLED);
            events.publishEvent(new GameResultCommitted(new GameResultView(101, stored.version(), GAME, "OMOK",
                    stored.status(), stored.endReason(), stored.settlementStatus(), 5, stored.participants(), -5L, clock.instant())));
            first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("phase").asText().equals("WAITING"));
            assertThat(hub.listTables().tables().getFirst().betAmountPerPlayer()).isEqualTo(5);
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("WAITING");
        }
    }

    private void prepare(ScenarioClient first, ScenarioClient second, String game) throws Exception {
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.request("GAME_SELECT", game.equals("DICE") ? Map.of("betAmountPerPlayer", 1, "gameCode", game, "targetScore", 4000) : Map.of("betAmountPerPlayer", 1, "gameCode", game));
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
    }

    @Test
    void 실제시간패종료_자동결과_정산알림_재접속조회까지이어진다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            reservation.release.countDown();
            playing(first);
            first.state("RESTORED"); second.state("RESTORED");
            // 결과 저장 경계만 대역이다. 시작·30초 시간패 판정·JWT·소켓은 실제 구현이다.
            for (long user : new long[]{101, 202}) {
                results.saved.put(user, result(user, SettlementStatus.PENDING));
            }
            clock.advanceSeconds(30);
            engine.tick();
            for (var client : List.of(first, second)) {
                boolean[] finished = {false};
                JsonNode[] receivedResult = {null};
                client.await(message -> {
                    if (message.path("type").asText().equals("GAME_CONNECTION_STATE")
                            && message.path("payload").path("status").asText().equals("FINISHED")) {
                        finished[0] = true;
                    }
                    if (message.path("type").asText().equals("GAME_RESULT")) {
                        receivedResult[0] = message;
                    }
                    return finished[0] && receivedResult[0] != null;
                });
                var pending = receivedResult[0];
                assertThat(pending.path("requestId").isNull()).isTrue();
                assertThat(pending.path("payload").path("settlementStatus").asText()).isEqualTo("PENDING");
                assertThat(pending.path("payload").path("myCoinDelta").isNull()).isTrue();
            }
            assertThat(engine.load(101, GAME).orElseThrow().publicState().path("endReason").asText())
                    .isEqualTo("TURN_TIMEOUT");
            assertThat(first.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "late",
                    "expectedVersion", 1, "input", Map.of("x", 7, "y", 7)))
                    .path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            for (long user : new long[]{101, 202}) {
                results.saved.put(user, result(user, SettlementStatus.SETTLED));
                events.publishEvent(new GameResultCommitted(results.saved.get(user)));
            }
            assertThat(first.await(m -> m.path("type").asText().equals("GAME_RESULT"))
                    .path("payload").path("myCoinDelta").asLong()).isEqualTo(-1);
            assertThat(second.await(m -> m.path("type").asText().equals("GAME_RESULT"))
                    .path("payload").path("myCoinDelta").asLong()).isEqualTo(1);
            first.stopPong(); assertThat(first.awaitClose()).isEqualTo(1001);
            try (var returned = connect(101, "FINISHED")) {
                var replay = returned.request("GAME_RESULT_CHECK", Map.of("gameSessionId", GAME));
                assertThat(replay.path("payload").path("version").asLong()).isEqualTo(2);
                assertThat(replay.path("payload").path("myCoinDelta").asLong()).isEqualTo(-1);
            }
            assertThat(reservation.reservations.get()).isEqualTo(1);
        }
    }

    private GameResultView result(long user, SettlementStatus settlement) {
        return new GameResultView(user, settlement == SettlementStatus.PENDING ? 1 : 2, GAME, "OMOK",
                GameResultView.Status.FINISHED, "TURN_TIMEOUT", settlement, 1,
                List.of(new GameResultView.Participant("101", "LOSE"), new GameResultView.Participant("202", "WIN")),
                settlement == SettlementStatus.PENDING ? null : user == 101 ? -1L : 1L,
                clock.instant().plusSeconds(settlement == SettlementStatus.PENDING ? 30 : 0));
    }

    @Test
    void 주사위목표선택_확정시작_굴림_재접속까지같은목표를쓴다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            assertThat(second.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "DICE", "targetScore", 2000))
                    .path("payload").path("code").asText()).isEqualTo("NOT_GAME_SELECTOR");
            first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "DICE", "targetScore", 6000));
            first.request("READY_SET", Map.of("ready", true));
            var selected = first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "DICE", "targetScore", 2000));
            assertThat(selected.path("payload").path("targetScore").asInt()).isEqualTo(2000);
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
            first.request("READY_SET", Map.of("ready", true)); second.request("READY_SET", Map.of("ready", true));
            reservation.release.countDown(); playing(first); first.state("RESTORED"); second.state("RESTORED");
            assertThat(reservation.lastCommand.targetScore()).isEqualTo(2000);
            var state = dice.load(101, GAME).orElseThrow();
            assertThat(state.publicState().path("targetScore").asInt()).isEqualTo(2000);
            var current = state.publicState().path("turnUserId").asText().equals("101") ? first : second;
            assertThat(current.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "roll-1",
                    "expectedVersion", 0, "input", Map.of("kind", "roll", "selectedIds", List.of())))
                    .path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            second.stopPong(); assertThat(second.awaitClose()).isEqualTo(1001);
            try (var returned = connect(202, "RESTORED")) {
                assertThat(returned.request("GAME_STATE_CHECK", Map.of("gameId", GAME))
                        .path("payload").path("publicState").path("targetScore").asInt()).isEqualTo(2000);
            }
            assertThat(reservation.reservations).hasValue(1);
        }
    }

    @Test
    void 정산대기는준비를막고_알림유실은저장조회로풀어_새경기를시작한다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK"); reservation.release.countDown(); playing(first);
            first.state("RESTORED"); second.state("RESTORED");
            clock.advanceSeconds(30); engine.tick();
            first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("phase").asText().equals("SETTLING"));
            first.state("FINISHED"); second.state("FINISHED");
            assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(2);
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
            assertThat(first.request("READY_SET", Map.of("ready", true)).path("payload").path("code").asText())
                    .isEqualTo("TABLE_BUSY");
            var pending = result(101, SettlementStatus.PENDING);
            events.publishEvent(new GameResultCommitted(pending));
            events.publishEvent(new GameResultCommitted(new GameResultView(101, 2, GAME, "OMOK",
                    GameResultView.Status.FINISHED, "TURN_TIMEOUT", SettlementStatus.SETTLED, 1,
                    List.of(new GameResultView.Participant("101", "LOSE"),
                            new GameResultView.Participant("303", "WIN")), -1L, clock.instant())));
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("SETTLING");
            // 실제 DB 커밋 알림을 놓친 상황: 저장 Gateway의 SETTLED를 명시 조회해 복구한다.
            // 위 잘못된 참가자 알림과 구분되는 더 최신 저장 버전이다.
            var stored = result(101, SettlementStatus.SETTLED);
            results.saved.put(101L, new GameResultView(stored.userId(), 3, stored.gameSessionId(), stored.gameCode(),
                    stored.status(), stored.endReason(), stored.settlementStatus(), stored.betAmountPerPlayer(),
                    stored.participants(), stored.myCoinDelta(), stored.endedAt()));
            first.request("GAME_RESULT_CHECK", Map.of("gameSessionId", GAME));
            first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("phase").asText().equals("WAITING"));
            first.request("READY_SET", Map.of("ready", true)); second.request("READY_SET", Map.of("ready", true));
            first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("gameSessionId").asText().equals(GAME + "-2")
                    && m.path("payload").path("phase").asText().equals("PLAYING"));
            events.publishEvent(new GameResultCommitted(results.saved.get(101L)));
            hub.roundEnded("table-1", GAME);
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("PLAYING");
            assertThat(reservation.reservations).hasValue(2);
            assertThat(engine.load(101, GAME + "-2")).isPresent();
        }
    }

    @Test
    void 엔진생성직후끝나도_시작성공반영뒤종료와정산을복구한다() throws Exception {
        org.mockito.Mockito.doAnswer(call -> {
            Object value = call.callRealMethod();
            clock.advanceSeconds(30); engine.tick();
            events.publishEvent(new GameResultCommitted(result(101, SettlementStatus.SETTLED)));
            return value;
        }).when(engine).create(anyString(), anyString(),
                anyLong(), anyLong());
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK"); reservation.release.countDown();
            first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("phase").asText().equals("WAITING")
                    && m.path("payload").path("gameSessionId").asText().equals(GAME));
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("WAITING");
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 확정전재접속도원래유예를지우지않는다(int seconds) throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(seconds);
            try (var returned = connect(202, "LOBBY")) {
                // 유예 안에 돌아온 시점이 기준이다. 확정이 더 늦어져도 그 복귀를 보존한다.
                clock.advanceSeconds(2);
                reservation.release.countDown();
                playing(first);
                returned.state(seconds == 29 ? "RESTORED" : "FINISHED");
                assertThat(reservation.reservations.get()).isEqualTo(1);
            }
        }
    }

    private void playing(ScenarioClient client) throws Exception {
        var state = client.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                && m.path("payload").path("phase").asText().equals("PLAYING")).path("payload");
        assertThat(state.path("simulation").asBoolean()).isFalse();
        assertThat(state.path("gameSessionId").asText()).isEqualTo(GAME);
    }

    @Test
    void 이전종료경기조회도새시작대기의유예를지우지않는다() throws Exception {
        engine.create("previous-game", "previous-table", 101, 202);
        clock.advanceSeconds(30);
        engine.tick();
        try (var first = connect(101, "FINISHED"); var second = connect(202, "FINISHED")) {
            prepare(first, second, "OMOK");
            assertThat(reservation.entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(30);
            try (var returned = connect(202, "FINISHED")) {
                reservation.release.countDown();
                playing(first);
                assertThat(returned.state("FINISHED").path("gameId").asText()).isEqualTo(GAME);
            }
        }
    }

    private ScenarioClient connect(long id) throws Exception { return connect(id, "LOBBY"); }

    private ScenarioClient connect(long id, String state) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(id, TestLoginSessions.ID))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client = new ScenarioClient(port, Long.toString(id),
                    new ObjectMapper().readTree(response.body()).path("ticket").asText());
            client.state(state);
            return client;
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean ReservationDouble reservationDouble() { return new ReservationDouble(); }
        @Bean ResultStoreDouble resultStoreDouble() { return new ResultStoreDouble(); }
    }

    static class ResultStoreDouble implements GameResultGateway {
        final Map<Long, GameResultView> saved = new ConcurrentHashMap<>();
        @Override public Optional<GameResultView> load(long user, String game) {
            return Optional.ofNullable(saved.get(user)).filter(result -> result.gameSessionId().equals(game));
        }
    }

    // 예약/DB 담당 경계의 대역. 실제 잔액·원장·DB 트랜잭션 성공을 뜻하지 않는다.
    static class ReservationDouble implements GameStartGateway {
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final AtomicInteger starts = new AtomicInteger();
        final AtomicInteger lookups = new AtomicInteger();
        final AtomicInteger reservations = new AtomicInteger();
        volatile GameStartCommand lastCommand;
        volatile String mode = "SUCCESS";
        volatile GameStartResult committed;

        @Override public GameStartResult startGame(GameStartCommand command) {
            starts.incrementAndGet();
            lastCommand = command;
            entered.countDown();
            try {
                if (!release.await(8, TimeUnit.SECONDS)) { throw new IllegalStateException("test timeout"); }
            } catch (InterruptedException exception) { throw new IllegalStateException(exception); }
            if (mode.equals("REJECT")) { return GameStartResult.rejected(command.startAttemptId(), "BALANCE"); }
            committed = GameStartResult.reserved(command, starts.get() == 1 ? GAME : GAME + "-" + starts.get());
            reservations.incrementAndGet();
            if (mode.equals("UNKNOWN")) { throw new IllegalStateException("test response lost after commit"); }
            if (mode.equals("INVALID")) {
                return new GameStartResult(command.startAttemptId(), GameStartResult.Outcome.RESERVED, GAME,
                        command.participants(), 99, 198, null);
            }
            return committed;
        }

        @Override public GameStartResult findStartResult(UUID id) {
            lookups.incrementAndGet();
            assertThat(committed.startAttemptId()).isEqualTo(id);
            return committed;
        }
    }
}
