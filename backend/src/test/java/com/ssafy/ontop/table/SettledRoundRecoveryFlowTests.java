package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.reconnect.ActiveGameLookup;
import com.ssafy.ontop.game.reconnect.ActiveGameRecord;
import com.ssafy.ontop.game.reconnect.GameReconnectService;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldClock;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// 정산 완료 후 테이블 대기·복구 판정 정합성. 실제 Hub·복구 서비스·직렬화를 쓰고,
// 예약/DB/엔진은 대역이다. 실제 DB 정산 성공을 뜻하지 않는다.
class SettledRoundRecoveryFlowTests {
    final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    final MutableClock clock = new MutableClock();
    final GameRuntimeIdentity identity = new GameRuntimeIdentity("test-instance");
    final Engine engine = new Engine();
    final Db db = new Db();
    final CommittedGameStartService starts = mock(CommittedGameStartService.class);
    final GameActionGateway actions = mock(GameActionGateway.class);
    final AtomicInteger reservations = new AtomicInteger();
    String gameCode = "OMOK";
    GameReconnectService reconnect;
    TableHub hub;

    @BeforeEach void setup() {
        reconnect = new GameReconnectService(Optional.of(engine), Optional.of(clock), Optional.of(db),
                Optional.of(identity));
        hub = new TableHub(mapper, Optional.empty(), false, Optional.of(reconnect),
                Duration.ofSeconds(60), Duration.ofSeconds(60),
                new WorldChannelRegistry(new WorldChannelProperties(null)), new WorldChatService(Duration.ofSeconds(1)),
                new WorldEmoteService(new WorldEmoteProperties(null), Duration.ofSeconds(1)), Optional.empty(),
                Optional.of(actions));
        hub.configureWorldClock(new WorldClock(clock));
        hub.configureCommittedStarts(Optional.of(starts));
        when(starts.start(any())).thenAnswer(call -> {
            GameStartCommand command = call.getArgument(0);
            long id = 70 + reservations.incrementAndGet();
            for (var player : command.participants()) {
                long user = Long.parseLong(player.userId());
                db.rows.put(user, record(id, GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING));
                engine.snapshots.put(user, snapshot(user, Long.toString(id), 0, Phase.PLAYING));
            }
            return GameStartResult.reserved(command, Long.toString(id));
        });
    }

    @AfterEach void close() { hub.shutdown(); reconnect.shutdown(); }

    @Test void 돌탑_종료와_교차한_조작만_복구요구_대신_경기종료로_응답한다() throws Exception {
        gameCode = "STONE_RUMBLE";
        Peer a = peer(101), b = peer(202), outsider = peer(303);
        a.recovery("LOBBY"); b.recovery("LOBBY"); outsider.recovery("LOBBY");
        play(a, b);
        var lateInput = Map.of("gameId", "71", "actionId", "last-move", "expectedVersion", 0,
                "input", Map.of("kind", "control", "seq", 1));

        var gate = new CountDownLatch(1);
        var entered = new CountDownLatch(1);
        engine.hook = user -> {
            if (user == 101) { entered.countDown(); await(gate); }
            return Optional.ofNullable(engine.snapshots.get(user));
        };
        try {
            end("71");
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            a.start("SETTLING");
            assertThat(reconnect.canControlGame(101, a.id, "71")).isFalse();
            assertError(a.request("GAME_ACTION_SEND", lateInput, "late-settling"),
                    "late-settling", "GAME_ACTION_GAME_FINISHED");
            assertError(outsider.request("GAME_ACTION_SEND", lateInput, "outside"),
                    "outside", "GAME_RECOVERY_REQUIRED");
            settle("71", "101");
            a.start("WAITING");
            assertError(a.request("GAME_ACTION_SEND", lateInput, "late-waiting"),
                    "late-waiting", "GAME_ACTION_GAME_FINISHED");
            var otherInput = new java.util.HashMap<String, Object>(lateInput);
            otherInput.put("gameId", "72");
            assertError(a.request("GAME_ACTION_SEND", otherInput, "other-round"),
                    "other-round", "GAME_RECOVERY_REQUIRED");
            verifyNoInteractions(actions);
        } finally {
            engine.hook = null;
            gate.countDown();
        }
        a.recovery("FINISHED");
    }

    @Test void 정상정산후_WAITING에서_다음판설정과_퇴장을_승인하고_진행중과정산중은_차단한다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        // PLAYING: 복구 게이트(RESTORED)가 ensureWaiting보다 먼저 거절한다.
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-playing"), "cfg-playing", "GAME_RECOVERY_REQUIRED");
        assertError(a.request("TABLE_LEAVE", Map.of(), "leave-playing"), "leave-playing", "GAME_RECOVERY_REQUIRED");
        end("71");
        a.start("SETTLING"); a.recovery("FINISHED"); b.recovery("FINISHED");
        // SETTLING: 로비 사용은 가능하지만 정산 전 테이블 변경은 ensureWaiting이 거절한다.
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-settling"), "cfg-settling", "TABLE_BUSY");
        assertError(b.request("TABLE_LEAVE", Map.of(), "leave-settling"), "leave-settling", "TABLE_BUSY");
        // 정산 미완료 결과 통지는 다음 판을 열지 않는다.
        hub.roundSettled(new GameResultCommitted(result("71", 101, GameResultView.SettlementStatus.PENDING, "101")));
        assertThat(hub.listTables().tables().getFirst().status()).isEqualTo("SETTLING");
        settle("71", "101");
        a.start("WAITING"); b.start("WAITING");
        // 정상 FINISHED는 정산 완료 통지로 다시 조회하지 않아 새 차단 구간을 만들지 않는다.
        a.assertNone(m -> m.path("type").asText().equals("GAME_CONNECTION_STATE"));
        assertThat(reconnect.canUseLobby(101, a.id)).isTrue();
        var configured = a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-waiting");
        assertThat(configured.path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(configured.path("requestId").asText()).isEqualTo("cfg-waiting");
        assertThat(configured.at("/payload/betAmountPerPlayer").asLong()).isEqualTo(2);
        var left = b.request("TABLE_LEAVE", Map.of(), "leave-waiting");
        assertThat(left.path("type").asText()).isEqualTo("TABLE_LEFT");
        assertThat(left.path("requestId").asText()).isEqualTo("leave-waiting");
        b.recovery("LOBBY");
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(1);
        assertThat(a.request("TABLE_LEAVE", Map.of(), "leave-host").path("type").asText()).isEqualTo("TABLE_LEFT");
        assertThat(reservations).hasValue(1);
        assertThat(engine.expirations).hasValue(0);
    }

    @Test void 종료직후_복구조회가_늦으면_그동안만_GAME_RECOVERY_REQUIRED이고_완료후_설정한다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        var gate = new CountDownLatch(1);
        var entered = new CountDownLatch(1);
        engine.hook = user -> {
            if (user == 101) { entered.countDown(); await(gate); }
            return Optional.ofNullable(engine.snapshots.get(user));
        };
        end("71");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        settle("71", "101");
        a.start("WAITING");
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-pending"), "cfg-pending", "GAME_RECOVERY_REQUIRED");
        engine.hook = null;
        gate.countDown();
        a.recovery("FINISHED");
        assertThat(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-after").path("type").asText()).isEqualTo("TABLE_STATE");
    }

    @Test void 이전경기의_늦은복구조회는_새경기_RESTORED와_조작권을_덮지못한다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        end("71"); a.recovery("FINISHED"); b.recovery("FINISHED");
        settle("71", "202");
        a.start("WAITING");
        a.request("READY_SET", Map.of("ready", true), "ready-a");
        b.request("READY_SET", Map.of("ready", true), "ready-b");
        var gate = new CountDownLatch(1);
        var entered = new CountDownLatch(1);
        var old = engine.snapshots.get(101L);
        var calls = new AtomicInteger();
        engine.hook = user -> {
            if (user == 101 && calls.incrementAndGet() == 1) { entered.countDown(); await(gate); return Optional.of(old); }
            return Optional.ofNullable(engine.snapshots.get(user));
        };
        a.send("GAME_RECONNECT_CHECK", Map.of(), "old-check");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        long version = b.request("TABLE_JOIN", Map.of("tableId", "table-1"), "state-b").at("/payload/version").asLong();
        b.request("TABLE_START", Map.of("actionId", "next", "expectedVersion", version), "start-next");
        a.start("PLAYING");
        assertThat(a.recovery("RESTORED").at("/payload/gameId").asText()).isEqualTo("72");
        a.drainQueued();
        gate.countDown();
        a.assertNone(m -> m.path("type").asText().equals("GAME_CONNECTION_STATE")
                && m.at("/payload/gameId").asText().equals("71"));
        assertThat(reconnect.canControlGame(101, a.id, "72")).isTrue();
        assertThat(reconnect.canControlGame(101, a.id, "71")).isFalse();
        assertThat(reservations).hasValue(2);
    }

    @Test void 복구조회중_퇴장은_요청ID로_거절되고_조회완료후_퇴장하면_이전경기를_되살리지않는다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        end("71"); a.recovery("FINISHED");
        settle("71", "101");
        a.start("WAITING");
        var gate = new CountDownLatch(1);
        var entered = new CountDownLatch(1);
        engine.hook = user -> {
            if (user == 101) { entered.countDown(); await(gate); }
            return Optional.ofNullable(engine.snapshots.get(user));
        };
        a.send("GAME_RECONNECT_CHECK", Map.of(), "check");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        assertError(a.request("TABLE_LEAVE", Map.of(), "leave-during-check"), "leave-during-check", "GAME_RECOVERY_REQUIRED");
        engine.hook = null;
        a.drainQueued();
        gate.countDown();
        assertThat(a.recovery("FINISHED").path("requestId").asText()).isEqualTo("check");
        assertThat(a.request("TABLE_LEAVE", Map.of(), "leave").path("type").asText()).isEqualTo("TABLE_LEFT");
        a.recovery("LOBBY");
        a.assertNone(m -> m.path("type").asText().equals("GAME_CONNECTION_STATE")
                && m.at("/payload/status").asText().equals("FINISHED"));
    }

    @Test void 같은사용자의_다른활성경기나_정산완료후_남은활성마커는_WAITING이어도_차단을_유지한다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        end("71"); a.recovery("FINISHED");
        settle("71", "101");
        a.start("WAITING");
        db.rows.put(101L, record(99, GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING));
        a.send("GAME_RECONNECT_CHECK", Map.of(), "other-game");
        assertThat(a.recovery("UNAVAILABLE").path("requestId").asText()).isEqualTo("other-game");
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-other"), "cfg-other", "GAME_RECOVERY_REQUIRED");
        assertError(a.request("TABLE_LEAVE", Map.of(), "leave-other"), "leave-other", "GAME_RECOVERY_REQUIRED");
        db.rows.put(101L, record(71, GameSession.Status.FINISHED, GameSession.SettlementStatus.SETTLED));
        a.send("GAME_RECONNECT_CHECK", Map.of(), "stale-marker");
        assertThat(a.recovery("UNAVAILABLE").path("requestId").asText()).isEqualTo("stale-marker");
        assertError(a.request("TABLE_LEAVE", Map.of(), "leave-stale"), "leave-stale", "GAME_RECOVERY_REQUIRED");
        db.rows.remove(101L);
        a.send("GAME_RECONNECT_CHECK", Map.of(), "clean");
        a.recovery("FINISHED");
        assertThat(a.request("TABLE_LEAVE", Map.of(), "leave-clean").path("type").asText()).isEqualTo("TABLE_LEFT");
    }

    @Test void 종료직후_조회장애의_UNAVAILABLE은_정산완료후_재검증으로_풀려_설정과_퇴장을_승인한다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        db.failure = new IllegalStateException("transient db failure");
        end("71");
        a.recovery("UNAVAILABLE"); b.recovery("UNAVAILABLE");
        // 정산 전 판정이 남아 있는 동안에는 SETTLING 차단보다 복구 확인이 먼저다.
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-unavailable"), "cfg-unavailable",
                "GAME_RECOVERY_REQUIRED");
        db.failure = null;
        settle("71", "101");
        a.start("WAITING");
        var rechecked = a.recovery("FINISHED");
        assertThat(rechecked.path("requestId").isNull()).isTrue();
        assertThat(rechecked.at("/payload/gameId").asText()).isEqualTo("71");
        b.recovery("FINISHED");
        assertThat(reconnect.canUseLobby(101, a.id)).isTrue();
        var configured = a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-rechecked");
        assertThat(configured.path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(configured.path("requestId").asText()).isEqualTo("cfg-rechecked");
        var left = b.request("TABLE_LEAVE", Map.of(), "leave-rechecked");
        assertThat(left.path("type").asText()).isEqualTo("TABLE_LEFT");
        assertThat(left.path("requestId").asText()).isEqualTo("leave-rechecked");
        assertThat(reservations).hasValue(1);
    }

    @Test void 정산완료후_재검증도_실패하면_UNAVAILABLE과_차단을_유지한다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        db.failure = new IllegalStateException("db still failing");
        end("71");
        a.recovery("UNAVAILABLE");
        settle("71", "101");
        a.start("WAITING");
        a.recovery("PENDING");
        a.recovery("UNAVAILABLE");
        assertThat(reconnect.canUseLobby(101, a.id)).isFalse();
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-failed"), "cfg-failed", "GAME_RECOVERY_REQUIRED");
        assertError(a.request("TABLE_LEAVE", Map.of(), "leave-failed"), "leave-failed", "GAME_RECOVERY_REQUIRED");
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isEqualTo(2);
        db.failure = null;
        a.send("GAME_RECONNECT_CHECK", Map.of(), "recheck");
        assertThat(a.recovery("FINISHED").path("requestId").asText()).isEqualTo("recheck");
        assertThat(a.request("TABLE_LEAVE", Map.of(), "leave-recovered").path("type").asText()).isEqualTo("TABLE_LEFT");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void 정산완료_재검증때_다른활성경기나_남은활성마커가_있으면_차단을_유지한다(boolean otherGame) throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        db.failure = new IllegalStateException("transient db failure");
        end("71");
        a.recovery("UNAVAILABLE");
        db.failure = null;
        db.rows.clear();
        // 다른 경기의 예약금 또는 SETTLED인데 해제되지 않은 예약을 정상 정산으로 묵인하지 않는다.
        db.rows.put(101L, otherGame
                ? record(99, GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING)
                : record(71, GameSession.Status.FINISHED, GameSession.SettlementStatus.SETTLED));
        hub.roundSettled(new GameResultCommitted(result("71", 101, GameResultView.SettlementStatus.SETTLED, "101")));
        a.start("WAITING");
        a.recovery("PENDING");
        a.recovery("UNAVAILABLE");
        b.recovery("FINISHED");
        assertError(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-held"), "cfg-held", "GAME_RECOVERY_REQUIRED");
        assertError(a.request("TABLE_LEAVE", Map.of(), "leave-held"), "leave-held", "GAME_RECOVERY_REQUIRED");
        // 같은 테이블의 다른 참가자는 자기 판정대로 퇴장할 수 있다.
        assertThat(b.request("TABLE_LEAVE", Map.of(), "leave-other").path("type").asText()).isEqualTo("TABLE_LEFT");
    }

    @Test void 정산전에_시작된_조회는_정산후_원래요청ID로_다시읽고_늦은_실패는_버린다() throws Exception {
        Peer a = peer(101), b = peer(202);
        a.recovery("LOBBY"); b.recovery("LOBBY");
        play(a, b);
        end("71");
        a.recovery("FINISHED");
        var gate = new CountDownLatch(1);
        var entered = new CountDownLatch(1);
        var calls = new AtomicInteger();
        engine.hook = user -> {
            if (user == 101 && calls.incrementAndGet() == 1) {
                entered.countDown();
                await(gate);
                throw new IllegalStateException("read before settlement failed late");
            }
            return Optional.ofNullable(engine.snapshots.get(user));
        };
        a.send("GAME_RECONNECT_CHECK", Map.of(), "check-before-settle");
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        settle("71", "101");
        a.start("WAITING");
        var rechecked = a.recovery("FINISHED");
        assertThat(rechecked.path("requestId").asText()).isEqualTo("check-before-settle");
        a.drainQueued();
        gate.countDown();
        a.assertNone(m -> m.path("type").asText().equals("GAME_CONNECTION_STATE")
                && m.at("/payload/status").asText().equals("UNAVAILABLE"));
        assertThat(a.request("TABLE_CONFIGURE", configure(a, 2), "cfg-after-restart").path("type").asText())
                .isEqualTo("TABLE_STATE");
    }

    @Test void 착석뒤_처리된_WORLD_MOVE의_TABLE_BUSY는_이동요청ID에만_연결된다() throws Exception {
        Peer a = peer(101);
        a.recovery("LOBBY");
        a.send("TABLE_JOIN", Map.of("tableId", "table-1"), "join");
        a.send("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0, "run", false), "move");
        var join = a.await(m -> m.path("requestId").asText().equals("join"));
        var move = a.await(m -> m.path("requestId").asText().equals("move"));
        assertThat(join.path("type").asText()).isEqualTo("TABLE_STATE");
        assertError(move, "move", "TABLE_BUSY");
        assertThat(a.log).containsSubsequence("TABLE_STATE:join", "ERROR:move");
    }

    void play(Peer a, Peer b) throws Exception {
        a.request("TABLE_JOIN", Map.of("tableId", "table-1"), "join-a");
        b.request("TABLE_JOIN", Map.of("tableId", "table-1"), "join-b");
        a.request("TABLE_CONFIGURE", configure(a, "STONE_RUMBLE".equals(gameCode) ? 0 : 1), "cfg-initial");
        a.request("READY_SET", Map.of("ready", true), "ready-a");
        b.request("READY_SET", Map.of("ready", true), "ready-b");
        long version = a.request("TABLE_JOIN", Map.of("tableId", "table-1"), "state").at("/payload/version").asLong();
        a.request("TABLE_START", Map.of("actionId", "first", "expectedVersion", version), "start");
        a.start("PLAYING"); b.start("PLAYING");
        a.recovery("RESTORED"); b.recovery("RESTORED");
    }

    void end(String game) {
        long id = Long.parseLong(game);
        for (long user : new long[]{101, 202}) {
            engine.snapshots.put(user, snapshot(user, game, 5, Phase.FINISHED));
            db.rows.put(user, record(id, GameSession.Status.FINISHED, GameSession.SettlementStatus.PENDING));
        }
        hub.roundEnded("table-1", game);
    }

    void settle(String game, String winner) {
        // 정산 트랜잭션은 SETTLED와 예약 해제를 함께 커밋한다. 통지는 커밋 뒤에 도착한다.
        db.rows.remove(101L); db.rows.remove(202L);
        hub.roundSettled(new GameResultCommitted(result(game, 101, GameResultView.SettlementStatus.SETTLED, winner)));
    }

    Map<String, Object> configure(Peer peer, long bet) throws Exception {
        long version = peer.request("TABLE_JOIN", Map.of("tableId", "table-1"), "version-" + UUID.randomUUID())
                .at("/payload/version").asLong();
        return Map.of("gameCode", gameCode, "selectedPlayers", 2, "betAmountPerPlayer", bet, "expectedVersion", version);
    }

    GameResultView result(String game, long user, GameResultView.SettlementStatus settlement, String winner) {
        String loser = winner.equals("101") ? "202" : "101";
        return new GameResultView(user, settlement == GameResultView.SettlementStatus.PENDING ? 1 : 2, game, gameCode,
                GameResultView.Status.FINISHED, "NORMAL", settlement, "STONE_RUMBLE".equals(gameCode) ? 0 : 1,
                List.of(new GameResultView.Participant(winner, "WIN"), new GameResultView.Participant(loser, "LOSE")),
                settlement == GameResultView.SettlementStatus.PENDING ? null : 1L, clock.instant());
    }

    ActiveGameRecord record(long id, GameSession.Status status, GameSession.SettlementStatus settlement) {
        return new ActiveGameRecord(id, gameCode, "table-1", status, settlement, identity.instanceId(),
                identity.bootId(), clock.instant(), clock.instant(),
                status == GameSession.Status.FINISHED ? clock.instant() : null);
    }

    GameRecoverySnapshot snapshot(long user, String game, long version, Phase phase) {
        return new GameRecoverySnapshot(user, game, 2, version, phase, mapper.createObjectNode().put("game", game));
    }

    static void assertError(JsonNode message, String requestId, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.path("requestId").asText()).isEqualTo(requestId);
        assertThat(message.at("/payload/code").asText()).isEqualTo(code);
    }

    static void await(CountDownLatch gate) {
        try {
            if (!gate.await(5, TimeUnit.SECONDS)) { throw new IllegalStateException("test gate timeout"); }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    Peer peer(long user) throws Exception {
        var socket = mock(WebSocketSession.class);
        String id = UUID.randomUUID().toString();
        when(socket.getId()).thenReturn(id);
        when(socket.isOpen()).thenReturn(true);
        var peer = new Peer(id);
        doAnswer(call -> {
            if (call.getArgument(0) instanceof TextMessage text) {
                JsonNode message = mapper.readTree(text.getPayload());
                peer.log.add(message.path("type").asText() + ":" + message.path("requestId").asText());
                peer.messages.add(message);
            }
            return null;
        }).when(socket).sendMessage(any());
        assertThat(hub.connectAuthenticated(socket, new VerifiedWebSocketUser(user,
                VerifiedWebSocketUser.Provider.NAVER, "00000000-0000-0000-0000-000000000001"))).isTrue();
        return peer;
    }

    class Peer {
        final String id;
        final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        final Deque<JsonNode> deferred = new ArrayDeque<>();
        final List<String> log = new CopyOnWriteArrayList<>();

        Peer(String id) { this.id = id; }

        void send(String type, Map<String, ?> payload, String requestId) throws Exception {
            if (type.equals("READY_SET") && Boolean.TRUE.equals(payload.get("ready"))) {
                var state = request("TABLE_JOIN", Map.of("tableId", "table-1"), requestId + "-state").path("payload");
                payload = Map.of("ready", true, "betAmountPerPlayer", state.path("betAmountPerPlayer").asLong(),
                        "expectedVersion", state.path("version").asLong());
            }
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
        }

        JsonNode request(String type, Map<String, ?> payload, String requestId) throws Exception {
            send(type, payload, requestId);
            return await(m -> m.path("requestId").asText().equals(requestId) && !isPending(m));
        }

        JsonNode recovery(String status) throws Exception {
            return await(m -> m.path("type").asText().equals("GAME_CONNECTION_STATE")
                    && m.at("/payload/status").asText().equals(status));
        }

        /** 지연 응답을 풀기 전까지 도착한 메시지를 보관해 이후 도착분만 검사한다. */
        void drainQueued() {
            JsonNode message;
            while ((message = messages.poll()) != null) { deferred.addLast(message); }
        }

        JsonNode start(String phase) throws Exception {
            return await(m -> m.path("type").asText().equals("GAME_START_STATE")
                    && m.at("/payload/phase").asText().equals(phase));
        }

        void assertNone(Predicate<JsonNode> forbidden) throws Exception {
            JsonNode message;
            while ((message = messages.poll(300, TimeUnit.MILLISECONDS)) != null) {
                assertThat(forbidden.test(message)).as(message.toString()).isFalse();
                deferred.addLast(message);
            }
        }

        JsonNode await(Predicate<JsonNode> condition) throws Exception {
            var iterator = deferred.iterator();
            while (iterator.hasNext()) {
                JsonNode message = iterator.next();
                if (condition.test(message)) { iterator.remove(); return message; }
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            long remaining;
            while ((remaining = deadline - System.nanoTime()) > 0) {
                JsonNode message = messages.poll(remaining, TimeUnit.NANOSECONDS);
                if (message == null) { break; }
                if (condition.test(message)) { return message; }
                deferred.addLast(message);
            }
            throw new AssertionError("missing message; received=" + log);
        }

        private boolean isPending(JsonNode message) {
            return message.path("type").asText().equals("GAME_CONNECTION_STATE")
                    && message.at("/payload/status").asText().equals("PENDING");
        }
    }

    static class Engine implements GameRecoveryGateway {
        final Map<Long, GameRecoverySnapshot> snapshots = new ConcurrentHashMap<>();
        final AtomicInteger expirations = new AtomicInteger();
        volatile Function<Long, Optional<GameRecoverySnapshot>> hook;

        @Override public Optional<GameRecoverySnapshot> load(long userId) {
            var current = hook;
            return current != null ? current.apply(userId) : Optional.ofNullable(snapshots.get(userId));
        }

        @Override public void graceExpired(GraceExpiration command) { expirations.incrementAndGet(); }
    }

    static class Db implements ActiveGameLookup {
        final Map<Long, ActiveGameRecord> rows = new ConcurrentHashMap<>();
        volatile RuntimeException failure;

        @Override public Optional<ActiveGameRecord> findByUserId(long userId) {
            var current = failure;
            if (current != null) { throw current; }
            return Optional.ofNullable(rows.get(userId));
        }
    }

    static class MutableClock extends Clock {
        volatile Instant now = Instant.parse("2026-10-29T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
