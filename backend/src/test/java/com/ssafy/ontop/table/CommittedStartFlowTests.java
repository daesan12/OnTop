package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.GameResultView.SettlementStatus;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true",
        "ontop.games.omok.enabled=true", "ontop.websocket.heartbeat.interval=200ms",
        "ontop.websocket.heartbeat.timeout=2s",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class CommittedStartFlowTests {
    private static final String GAME = "committed-test-game";
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @Autowired OmokEngine engine;
    @Autowired LedgerDouble ledger;
    @Autowired OmokFlowTests.TestClock clock;
    @Autowired TableHub hub;
    @Autowired ResultStoreDouble results;
    @Autowired ApplicationEventPublisher events;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") Clock oauthClock;

    @BeforeEach
    void accounts() {
        when(oauthClock.instant()).thenAnswer(invocation -> clock.instant());
        when(accounts.findActive(101)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER)));
        when(accounts.findActive(202)).thenReturn(Optional.of(new VerifiedWebSocketUser(202,
                VerifiedWebSocketUser.Provider.SSAFY)));
    }

    @Test
    void 확정전미시작_성공후착수_중복조회와재접속은재차감하지않는다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(engine.load(101, GAME)).isEmpty();
            assertThat(first.request("TABLE_LEAVE", Map.of()).path("payload").path("code").asText())
                    .isEqualTo("TABLE_BUSY");
            ledger.release.countDown();
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
            assertThat(ledger.starts.get()).isEqualTo(1);
            assertThat(ledger.debits.get()).isEqualTo(1);
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("PLAYING");
        }
    }

    @Test
    void 확정거절은전원준비를초기화하고엔진을생성하지않는다() throws Exception {
        ledger.mode = "REJECT";
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            ledger.release.countDown();
            var rejected = first.await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.path("payload").path("code").asText().equals("START_REJECTED"));
            assertThat(rejected.path("payload").path("phase").asText()).isEqualTo("WAITING");
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
            assertThat(engine.load(101, GAME)).isEmpty();
            assertThat(ledger.debits.get()).isZero();
        }
    }

    @Test
    void 커밋후응답유실은같은시도조회로복구하고다시차감하지않는다() throws Exception {
        ledger.mode = "UNKNOWN";
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            ledger.release.countDown();
            first.await(m -> m.path("payload").path("code").asText().equals("START_RESULT_UNKNOWN"));
            assertThat(engine.load(101, GAME)).isEmpty();
            first.request("GAME_START_CHECK", Map.of());
            playing(first);
            first.state("RESTORED");
            assertThat(ledger.starts.get()).isEqualTo(1);
            assertThat(ledger.lookups.get()).isEqualTo(1);
            assertThat(ledger.debits.get()).isEqualTo(1);
        }
    }

    @Test
    void 잘못된확정금액은엔진시작으로바꾸지않는다() throws Exception {
        ledger.mode = "INVALID";
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            ledger.release.countDown();
            first.await(m -> m.path("payload").path("code").asText().equals("START_RESULT_INVALID"));
            assertThat(engine.load(101, GAME)).isEmpty();
            assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("STARTING");
        }
    }

    @Test
    void 목표전달미정주사위는차감요청전에거절한다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "DICE");
            first.await(m -> m.path("payload").path("code").asText().equals("START_REJECTED"));
            assertThat(ledger.starts.get()).isZero();
            assertThat(ledger.debits.get()).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 차감확정대기중끊겨도원래단절시각의복귀유예를유지한다(int seconds) throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(seconds);
            ledger.release.countDown();
            playing(first);
            try (var returned = connect(202, seconds == 29 ? "RESTORED" : "FINISHED")) {
                assertThat(ledger.debits.get()).isEqualTo(1);
                assertThat(returned.request("GAME_START_CHECK", Map.of()).path("type").asText())
                        .isEqualTo("GAME_START_STATE");
            }
        }
    }

    private void prepare(ScenarioClient first, ScenarioClient second, String game) throws Exception {
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        first.request("GAME_SELECT", Map.of("gameCode", game));
        first.request("READY_SET", Map.of("ready", true));
        second.request("READY_SET", Map.of("ready", true));
    }

    @Test
    void 실제시간패종료_자동결과_정산알림_재접속조회까지이어진다() throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            ledger.release.countDown();
            playing(first);
            first.state("RESTORED"); second.state("RESTORED");
            // 결과 저장 경계만 대역이다. 시작·30초 시간패 판정·JWT·소켓은 실제 구현이다.
            for (long user : new long[]{101, 202}) {
                results.saved.put(user, result(user, SettlementStatus.PENDING));
            }
            clock.advanceSeconds(30);
            engine.tick();
            for (var client : List.of(first, second)) {
                var pending = client.await(m -> m.path("type").asText().equals("GAME_RESULT"));
                assertThat(pending.path("requestId").isNull()).isTrue();
                assertThat(pending.path("payload").path("settlementStatus").asText()).isEqualTo("PENDING");
                assertThat(pending.path("payload").path("myCoinDelta").isNull()).isTrue();
            }
            assertThat(engine.load(101, GAME).orElseThrow().publicState().path("endReason").asText())
                    .isEqualTo("TURN_TIMEOUT");
            assertThat(first.request("GAME_ACTION_SEND", Map.of("gameId", GAME, "actionId", "late",
                    "expectedVersion", 1, "input", Map.of("x", 7, "y", 7)))
                    .path("payload").path("code").asText()).isEqualTo("GAME_ACTION_INVALID_ACTION");
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
            assertThat(ledger.debits.get()).isEqualTo(1);
        }
    }

    private GameResultView result(long user, SettlementStatus settlement) {
        return new GameResultView(user, settlement == SettlementStatus.PENDING ? 1 : 2, GAME, "OMOK",
                GameResultView.Status.FINISHED, "TURN_TIMEOUT", settlement, 1,
                List.of(new GameResultView.Participant("101", "LOSE"), new GameResultView.Participant("202", "WIN")),
                settlement == SettlementStatus.PENDING ? null : user == 101 ? -1L : 1L,
                clock.instant().plusSeconds(settlement == SettlementStatus.PENDING ? 30 : 0));
    }

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 확정전재접속도원래유예를지우지않는다(int seconds) throws Exception {
        try (var first = connect(101); var second = connect(202)) {
            prepare(first, second, "OMOK");
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(seconds);
            try (var returned = connect(202, "LOBBY")) {
                // 유예 안에 돌아온 시점이 기준이다. 확정이 더 늦어져도 그 복귀를 보존한다.
                clock.advanceSeconds(2);
                ledger.release.countDown();
                playing(first);
                returned.state(seconds == 29 ? "RESTORED" : "FINISHED");
                assertThat(ledger.debits.get()).isEqualTo(1);
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
            assertThat(ledger.entered.await(5, TimeUnit.SECONDS)).isTrue();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            clock.advanceSeconds(30);
            try (var returned = connect(202, "FINISHED")) {
                ledger.release.countDown();
                playing(first);
                assertThat(returned.state("FINISHED").path("gameId").asText()).isEqualTo(GAME);
            }
        }
    }

    private ScenarioClient connect(long id) throws Exception { return connect(id, "LOBBY"); }

    private ScenarioClient connect(long id, String state) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(id))
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
        @Bean LedgerDouble ledgerDouble() { return new LedgerDouble(); }
        @Bean ResultStoreDouble resultStoreDouble() { return new ResultStoreDouble(); }
    }

    static class ResultStoreDouble implements GameResultGateway {
        final Map<Long, GameResultView> saved = new ConcurrentHashMap<>();
        @Override public Optional<GameResultView> load(long user, String game) {
            return Optional.ofNullable(saved.get(user)).filter(result -> result.gameSessionId().equals(game));
        }
    }

    // 차감/DB 담당 경계의 대역. 실제 잔액·원장·DB 트랜잭션 성공을 뜻하지 않는다.
    static class LedgerDouble implements GameStartGateway {
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final AtomicInteger starts = new AtomicInteger();
        final AtomicInteger lookups = new AtomicInteger();
        final AtomicInteger debits = new AtomicInteger();
        volatile String mode = "SUCCESS";
        volatile GameStartResult committed;

        @Override public GameStartResult startGame(GameStartCommand command) {
            starts.incrementAndGet();
            entered.countDown();
            try {
                if (!release.await(8, TimeUnit.SECONDS)) { throw new IllegalStateException("test timeout"); }
            } catch (InterruptedException exception) { throw new IllegalStateException(exception); }
            if (mode.equals("REJECT")) { return GameStartResult.rejected(command.startAttemptId(), "BALANCE"); }
            committed = GameStartResult.succeeded(command, GAME);
            debits.incrementAndGet();
            if (mode.equals("UNKNOWN")) { throw new IllegalStateException("test response lost after commit"); }
            if (mode.equals("INVALID")) {
                return new GameStartResult(command.startAttemptId(), GameStartResult.Outcome.SUCCEEDED, GAME,
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
