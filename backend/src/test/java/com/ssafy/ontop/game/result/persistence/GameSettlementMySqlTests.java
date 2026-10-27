package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.domain.GameAmounts;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.JpaGameStartGateway;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.IntStream;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@Tag("mysql")
@RecordApplicationEvents
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.game-start.enabled=true", "ontop.games.omok.enabled=true",
        "ontop.game-recovery.background-enabled=false",
        "ontop.shop.enabled=true", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "spring.datasource.hikari.maximum-pool-size=12"
})
class GameSettlementMySqlTests {
    @Autowired private JpaGameStartGateway starts;
    @Autowired private GameFinishPersistenceService finishes;
    @Autowired private GameSettlementPersistenceService settlements;
    @Autowired private GameTerminalRetryService terminalRetries;
    @Autowired private GameEventDelivery delivery;
    @Autowired private GameResultNotifications resultNotifications;
    @Autowired private GameFinishedPersistenceListener listener;
    @Autowired private JpaGameResultGateway results;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ApplicationEvents notifications;
    @Autowired private ApplicationEventPublisher publisher;
    @Autowired private OmokEngine omok;
    @Autowired private CommittedGameStartService committedStarts;
    @Autowired private Flyway flyway;
    @MockitoSpyBean private PlatformTransactionManager transactions;

    @DynamicPropertySource static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_story(?:173|174)_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("정산 검증은 승인한 신규 Story 173/174 격리 DB에서만 실행합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @Test void 신규_DB에서_최신_마이그레이션과_JPA_validate와_재실행을_확인한다() {
        assertThat(flyway.info().applied()).extracting(m -> m.getVersion().getVersion())
                .endsWith("112", "122", "123", "124", "125", "126");
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
    }

    @ParameterizedTest @ValueSource(longs = {2, 5, 30})
    void 가변참가비_예약과_단독승자_정산은_DB확정금액만_사용한다(long bet) {
        var game = reserve("OMOK", bet, 2);
        assertReserved(game);
        assertThat(results.load(game.users()[0], game.id())).isEmpty();
        listener.finished(finish(game, 1));
        assertSettled(game, new long[]{bet, -bet}, 0);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().betAmountPerPlayer()).isEqualTo(bet);
    }

    @Test void 공동승리_보너스는_판돈지급과_중복되지_않는다() {
        var game = reserve("ONE_CARD", 5, 3);
        listener.finished(finish(game, 2));
        assertSettled(game, new long[]{3, 3, -5}, 1);
        assertThat(jdbc.queryForObject("SELECT SUM(balance_delta) FROM wallet_transactions WHERE game_session_id=? AND transaction_type='GAME_SETTLEMENT'",
                Long.class, Long.parseLong(game.id()))).isZero();
        assertThat(jdbc.queryForObject("SELECT SUM(balance_delta) FROM wallet_transactions WHERE game_session_id=? AND transaction_type='GAME_TIE_BONUS'",
                Long.class, Long.parseLong(game.id()))).isEqualTo(1);
    }

    @Test void 네명_세승자의_보너스와_전원공동승리의_영변화를_검증한다() {
        var tied = reserve("ONE_CARD", 10, 4);
        listener.finished(finish(tied, 3));
        assertSettled(tied, new long[]{4, 4, 4, -10}, 2);
        var all = reserve("ONE_CARD", 7, 4);
        listener.finished(finish(all, 4));
        assertSettled(all, new long[]{0, 0, 0, 0}, 0);
    }

    @Test void 무승부는_예약만_해제하고_GAME_RELEASE를_기록한다() {
        var game = reserve("OMOK", 25, 2);
        listener.finished(finish(game, 0));
        assertSettled(game, new long[]{0, 0}, 0);
        assertThat(jdbc.queryForList("SELECT transaction_type FROM wallet_transactions WHERE game_session_id=? ORDER BY id",
                String.class, Long.parseLong(game.id())))
                .containsExactly("GAME_RESERVE", "GAME_RESERVE", "GAME_RELEASE", "GAME_RELEASE");
    }

    @Test void 동일종료의_중복과_반복조회는_원장과버전을_추가하지_않는다() {
        var game = reserve("OMOK", 5, 2);
        GameFinished event = finish(game, 1);
        listener.finished(event);
        long before = ledgerCount(game);
        listener.finished(event); settlements.settle(Long.parseLong(game.id()));
        for (int i = 0; i < 3; i++) { assertThat(results.load(game.users()[0], game.id()).orElseThrow().version()).isEqualTo(2); }
        assertThat(ledgerCount(game)).isEqualTo(before);
        assertThat(results.load(member(100), game.id())).isEmpty();
        assertThat(results.load(game.users()[0], "not-a-db-id")).isEmpty();
        assertThat(results.load(game.users()[0], Long.toString(Long.MAX_VALUE))).isEmpty();
    }

    @Test void 동일종료_여덟개_동시요청도_한번만_정산한다() throws Exception {
        var game = reserve("ONE_CARD", 5, 3);
        GameFinished event = finish(game, 2);
        parallel(IntStream.range(0, 8).<Callable<Void>>mapToObj(i -> () -> { listener.finished(event); return null; }).toList());
        assertSettled(game, new long[]{3, 3, -5}, 1);
        assertThat(ledgerCount(game)).isEqualTo(7);
    }

    @Test void 저장된이벤트와_다른승자_또는다른참가자는_거절한다() {
        var game = reserve("OMOK", 5, 2);
        var event = finish(game, 1); listener.finished(event);
        var reversed = new GameFinished(event.eventId(), game.id(), game.command().tableId(), "OMOK", event.version(), List.of(
                new GameFinished.Participant(game.users()[0], GameFinished.Result.LOSE, null, null),
                new GameFinished.Participant(game.users()[1], GameFinished.Result.WIN, null, null)), event.endReason(), event.endedAt());
        assertThatThrownBy(() -> listener.finished(reversed)).isInstanceOf(IllegalStateException.class);
        assertSettled(game, new long[]{5, -5}, 0);
        var other = reserve("OMOK", 5, 2);
        var original = finish(other, 1);
        assertThatThrownBy(() -> finishes.accept(new GameFinished(original.eventId(), other.id(), other.command().tableId(), "OMOK", 1,
                List.of(original.participants().getFirst(), new GameFinished.Participant(game.users()[0], GameFinished.Result.LOSE, null, null)),
                "FIVE_IN_ROW", original.endedAt()))).isInstanceOf(IllegalArgumentException.class);
        assertReserved(other);
    }

    @Test void 보너스_원장저장실패는_정산전체를_롤백하고_같은판정을_재처리한다() {
        var game = reserve("ONE_CARD", 5, 3);
        long id = finishes.accept(finish(game, 2));
        String trigger = trigger(game, "GAME_TIE_BONUS");
        try { assertThatThrownBy(() -> settlements.settle(id)).isInstanceOf(RuntimeException.class); }
        finally { jdbc.execute("DROP TRIGGER `" + trigger + "`"); }
        assertPendingUnchanged(game);
        assertThat(committed(game, GameResultView.SettlementStatus.SETTLED)).isZero();
        settlements.settle(id);
        assertSettled(game, new long[]{3, 3, -5}, 1);
    }

    @Test void 커밋실패_대역은_실제_DB를_롤백하고_SETTLED알림을_내보내지_않는다() {
        var game = reserve("OMOK", 5, 2);
        long id = finishes.accept(finish(game, 1));
        AtomicBoolean failed = new AtomicBoolean();
        doAnswer(call -> {
            TransactionStatus status = call.getArgument(0);
            if (status.isNewTransaction() && failed.compareAndSet(false, true)) {
                transactions.rollback(status); throw new TransactionSystemException("fixture-commit");
            }
            return call.callRealMethod();
        }).when(transactions).commit(any());
        assertThatThrownBy(() -> settlements.settle(id)).isInstanceOf(TransactionSystemException.class);
        assertThat(failed).isTrue();
        assertPendingUnchanged(game);
        assertThat(committed(game, GameResultView.SettlementStatus.SETTLED)).isZero();
    }

    @Test void 회원상태가_탈퇴로바뀌어도_기존경기_재화와결과는_정산한다() {
        var game = reserve("OMOK", 5, 2);
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", game.users()[0]);
        listener.finished(finish(game, 1));
        assertSettled(game, new long[]{5, -5}, 0);
    }

    @Test void 안전정수_최대경계의_예약과정산을_실제_DB에서_검증한다() {
        long bet = GameAmounts.MAX_SAFE_INTEGER / 4;
        var game = reserve("ONE_CARD", bet, 4);
        listener.finished(finish(game, 1));
        assertSettled(game, new long[]{bet * 3, -bet, -bet, -bet}, 0);
    }

    @Test void 지갑_long합산_오버플로는_다른회원의정산까지_롤백한다() {
        var game = reserve("OMOK", 5, 2);
        long id = finishes.accept(finish(game, 1));
        jdbc.update("UPDATE wallets SET balance=? WHERE user_id=?", Long.MAX_VALUE, game.users()[0]);
        assertThatThrownBy(() -> settlements.settle(id)).isInstanceOf(ArithmeticException.class);
        assertThat(wallets.findByUserId(game.users()[0]).orElseThrow().balance()).isEqualTo(Long.MAX_VALUE);
        assertThat(wallets.findByUserId(game.users()[1]).orElseThrow().balance()).isEqualTo(game.initial());
        assertThat(ledgerCount(game)).isEqualTo(2);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().settlementStatus()).isEqualTo(GameResultView.SettlementStatus.PENDING);
    }

    @Test void 실제오목엔진의_수동기권_공통이벤트가_정산으로_연결된다() {
        var game = reserve("OMOK", 9, 2);
        omok.create(game.id(), game.command().tableId(), game.users()[0], game.users()[1]);
        omok.forfeit(new GameForfeitCommand(game.users()[0], game.id(), UUID.randomUUID().toString()));
        delivery.drain(100);
        assertSettled(game, new long[]{-9, 9}, 0);
        assertThat(jdbc.queryForObject("SELECT leave_reason FROM game_participants WHERE game_session_id=? AND user_id=?",
                String.class, Long.parseLong(game.id()), game.users()[0])).isEqualTo("EXPLICIT_LEAVE");
    }

    @Test void 이벤트_발행을_통한_정산과_커밋후알림을_연결한다() {
        var game = reserve("OMOK", 5, 2);
        publisher.publishEvent(finish(game, 1));
        delivery.drain(100);
        assertSettled(game, new long[]{5, -5}, 0);
        assertThat(committed(game, GameResultView.SettlementStatus.PENDING)).isEqualTo(2);
        assertThat(committed(game, GameResultView.SettlementStatus.SETTLED)).isEqualTo(2);
    }

    @Test void 예약_정산후에는_같은회원의_다음경기를_예약할수있다() {
        var game = reserve("OMOK", 5, 2); listener.finished(finish(game, 1));
        var next = new GameStartCommand(UUID.randomUUID(), game.command().tableId(), 2, "OMOK", game.command().participants(), null, 7);
        assertThat(starts.startGame(next).isReservationCommitted(next)).isTrue();
    }

    @Test void 원장실패로_판정수신까지_지워지지않고_조회는_지급을_반복하지않는다() {
        var game = reserve("OMOK", 5, 2);
        String trigger = trigger(game, "GAME_SETTLEMENT");
        try { assertThatThrownBy(() -> listener.finished(finish(game, 1))).isInstanceOf(RuntimeException.class); }
        finally { jdbc.execute("DROP TRIGGER `" + trigger + "`"); }
        assertPendingUnchanged(game);
        long before = ledgerCount(game);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().myCoinDelta()).isNull();
        assertThat(ledgerCount(game)).isEqualTo(before);
    }

    @Test void 이탈은_별도커밋하되_최종판정까지_예약을_유지한다() {
        var game = reserve("ONE_CARD", 7, 3);
        var leftAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        var event = new GameParticipantLeft(game.id() + ":left:" + game.users()[0], game.id(),
                game.command().tableId(), "ONE_CARD", 8, game.users()[0], GameDepartureReason.LOGOUT, leftAt);
        publisher.publishEvent(event);
        publisher.publishEvent(event);
        delivery.drain(100);
        assertReserved(game);
        assertThat(ledgerCount(game)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT participant_status FROM game_participants WHERE game_session_id=? AND user_id=?",
                String.class, Long.parseLong(game.id()), game.users()[0])).isEqualTo("LEFT");
        assertThat(jdbc.queryForObject("SELECT result FROM game_participants WHERE game_session_id=? AND user_id=?",
                String.class, Long.parseLong(game.id()), game.users()[0])).isNull();
        listener.finished(new GameFinished(game.id() + ":finished", game.id(), game.command().tableId(), "ONE_CARD", 10,
                List.of(new GameFinished.Participant(game.users()[0], GameFinished.Result.FORFEIT, GameDepartureReason.LOGOUT, leftAt),
                        new GameFinished.Participant(game.users()[1], GameFinished.Result.WIN, null, null),
                        new GameFinished.Participant(game.users()[2], GameFinished.Result.LOSE, null, null)),
                "PLAYER_LEFT", Instant.now()));
        assertSettled(game, new long[]{-7, 14, -7}, 0);
    }

    @Test void 전원이탈_무효반환의_동시중복도_잔액과_원장을_중복반영하지않는다() throws Exception {
        var game = reserve("LIAR_BRIDGE", 5, 3);
        var event = aborted(game);
        parallel(IntStream.range(0, 8).mapToObj(i -> (Callable<Void>) () -> {
            listener.finished(event); return null;
        }).toList());
        assertSettled(game, new long[]{0, 0, 0}, 0);
        assertThat(ledgerCount(game)).isEqualTo(6);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().status()).isEqualTo(GameResultView.Status.INVALID);
        assertThat(starts.findStartResult(game.command().startAttemptId()).code()).isEqualTo("GAME_ALREADY_TERMINATED");
    }

    @Test void 반환_원장실패는_전원롤백하며_INVALID_PENDING은_재시도할수있다() {
        var game = reserve("LIAR_BRIDGE", 9, 3);
        String failure = trigger(game, "GAME_RELEASE");
        try {
            assertThatThrownBy(() -> listener.finished(aborted(game))).isInstanceOf(RuntimeException.class);
        } finally {
            jdbc.execute("DROP TRIGGER `" + failure + "`");
        }
        assertPendingUnchanged(game);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().status()).isEqualTo(GameResultView.Status.INVALID);
        assertThat(committed(game, GameResultView.SettlementStatus.SETTLED)).isZero();
        settlements.settle(Long.parseLong(game.id()));
        assertSettled(game, new long[]{0, 0, 0}, 0);
    }

    @Test void 상충하는_정상종료와_무효종료의_경합은_한판정만_커밋한다() throws Exception {
        var game = reserve("LIAR_BRIDGE", 5, 3);
        var at = Instant.now();
        var normal = new GameFinished(game.id() + ":finished", game.id(), game.command().tableId(), "LIAR_BRIDGE", 10,
                List.of(new GameFinished.Participant(game.users()[0], GameFinished.Result.WIN, null, null),
                        new GameFinished.Participant(game.users()[1], GameFinished.Result.FORFEIT, GameDepartureReason.LOGOUT, at),
                        new GameFinished.Participant(game.users()[2], GameFinished.Result.FORFEIT, GameDepartureReason.LOGOUT, at)),
                "LAST_PLAYER_STANDING", at);
        var outcomes = parallel(List.of(normal, aborted(game)).stream().map(event -> (Callable<String>) () -> {
            try {
                listener.finished(event);
                return "COMMITTED";
            } catch (IllegalStateException conflict) {
                assertThat(conflict).hasMessage("이미 저장된 경기 판정과 다릅니다.");
                return "CONFLICT";
            }
        }).toList());
        assertThat(outcomes).containsExactlyInAnyOrder("COMMITTED", "CONFLICT");
        var result = results.load(game.users()[0], game.id()).orElseThrow();
        assertSettled(game, result.status() == GameResultView.Status.INVALID
                ? new long[]{0, 0, 0} : new long[]{10, -5, -5}, 0);
        assertThat(ledgerCount(game)).isEqualTo(6);
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT transaction_type) FROM wallet_transactions "
                + "WHERE game_session_id=? AND transaction_type IN ('GAME_RELEASE','GAME_SETTLEMENT')",
                Integer.class, Long.parseLong(game.id()))).isEqualTo(1);
    }

    @Test void 판정없는_INVALID_행도_null결과를_유지하며_예약만_반환한다() {
        var game = reserve("OMOK", 9, 2);
        // 승인된 격리 DB의 합성 fixture다. 실제 다른 boot를 무효화하는 기능은 연결하지 않는다.
        jdbc.update("UPDATE game_sessions SET status='INVALID',end_reason='ENGINE_LOST',ended_at=UTC_TIMESTAMP(3),"
                + "result_version=1 WHERE id=?", Long.parseLong(game.id()));
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().participants())
                .allSatisfy(p -> assertThat(p.result()).isNull());
        settlements.settle(Long.parseLong(game.id()));
        assertSettled(game, new long[]{0, 0}, 0);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().participants())
                .allSatisfy(p -> assertThat(p.result()).isNull());
    }

    @Test void 종결재시도는_PENDING만_정산반환하고_RESERVED는_유지한다() {
        var reserved = reserve("OMOK", 4, 2);
        var normal = reserve("OMOK", 6, 2);
        var invalid = reserve("LIAR_BRIDGE", 8, 3);
        finishes.accept(finish(normal, 1));
        finishes.accept(aborted(invalid));

        var batch = terminalRetries.retryPending(Long.parseLong(reserved.id()) - 1, 100);

        assertThat(batch.completed()).isEqualTo(2);
        assertThat(batch.failed()).isZero();
        assertThat(batch.nextAfterId()).isEqualTo(Long.parseLong(invalid.id()));
        assertSettled(normal, new long[]{6, -6}, 0);
        assertSettled(invalid, new long[]{0, 0, 0}, 0);
        assertReserved(reserved);
        assertThat(jdbc.queryForObject("SELECT status FROM game_sessions WHERE id=?", String.class,
                Long.parseLong(reserved.id()))).isEqualTo("RESERVED");
        long before = ledgerCount(normal) + ledgerCount(invalid);
        var empty = terminalRetries.retryPending(batch.nextAfterId(), 100);
        assertThat(empty.completed()).isZero();
        assertThat(empty.failed()).isZero();
        assertThat(empty.nextAfterId()).isZero();
        assertThat(ledgerCount(normal) + ledgerCount(invalid)).isEqualTo(before);
    }

    @Test void 이탈기록_DB실패는_상태와예약을_유지하고_동일이벤트를_재시도한다() {
        var game = reserve("ONE_CARD", 7, 3);
        var event = new GameParticipantLeft(game.id() + ":left:" + game.users()[0], game.id(),
                game.command().tableId(), "ONE_CARD", 8, game.users()[0], GameDepartureReason.LOGOUT, Instant.now());
        String failure = "game174_fail_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE TRIGGER `" + failure + "` BEFORE UPDATE ON game_participants FOR EACH ROW BEGIN "
                + "IF NEW.game_session_id=" + Long.parseLong(game.id()) + " AND NEW.participant_status='LEFT' THEN "
                + "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture departure rollback'; END IF; END");
        try {
            var receipt = delivery.submit(event).toCompletableFuture();
            assertThat(delivery.drain(100)).isZero();
            assertThat(receipt.isDone()).isFalse();
        } finally {
            jdbc.execute("DROP TRIGGER `" + failure + "`");
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_participants WHERE game_session_id=? "
                + "AND participant_status='ACTIVE' AND left_at IS NULL AND leave_reason IS NULL",
                Integer.class, Long.parseLong(game.id()))).isEqualTo(3);
        assertReserved(game);
        assertThat(ledgerCount(game)).isEqualTo(3);
        publisher.publishEvent(event);
        // DB 오류 후에는 일정 시간 뒤 같은 불변 이벤트를 재수신한다.
        org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(3)).untilAsserted(() -> {
            delivery.drain(100);
            assertThat(delivery.pendingCount()).isZero();
        });
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_participants WHERE game_session_id=? "
                + "AND participant_status='LEFT'", Integer.class, Long.parseLong(game.id()))).isEqualTo(1);
        assertReserved(game);
        assertThat(ledgerCount(game)).isEqualTo(3);
    }

    @Test void 실제엔진_활성화후_RUNNING을_기록하고_종결조회는_재활성화하지않는다() {
        var game = reserve("OMOK", 5, 2);
        assertThat(committedStarts.find(game.command()).isReservationCommitted(game.command())).isTrue();
        assertThat(jdbc.queryForObject("SELECT status FROM game_sessions WHERE id=?", String.class,
                Long.parseLong(game.id()))).isEqualTo("RUNNING");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_sessions WHERE id=? AND started_at IS NOT NULL",
                Integer.class, Long.parseLong(game.id()))).isEqualTo(1);
        listener.finished(finish(game, 1));
        assertThat(committedStarts.find(game.command()).code()).isEqualTo("GAME_ALREADY_TERMINATED");
        assertSettled(game, new long[]{5, -5}, 0);
    }

    private GameFinished aborted(Fixture game) {
        var at = Instant.now();
        return new GameFinished(game.id() + ":finished", game.id(), game.command().tableId(), "LIAR_BRIDGE", 10,
                java.util.Arrays.stream(game.users()).mapToObj(id -> new GameFinished.Participant(id,
                        GameFinished.Result.FORFEIT, GameDepartureReason.LOGOUT, at)).toList(),
                "ABORTED_NO_PLAYERS", at);
    }

    private Fixture reserve(String code, long bet, int count) {
        long initial = Math.max(100, bet);
        long[] players = IntStream.range(0, count).mapToLong(i -> member(initial)).toArray();
        var command = new GameStartCommand(UUID.randomUUID(), "settlement-" + UUID.randomUUID(), 1, code,
                IntStream.range(0, count).mapToObj(i -> new GameStartCommand.Participant(Long.toString(players[i]), i + 1)).toList(), null, bet);
        var result = starts.startGame(command);
        assertThat(result.isReservationCommitted(command)).isTrue();
        return new Fixture(command, result.gameSessionId(), players, initial);
    }

    private long member(long initial) {
        long id = users.saveAndFlush(new User(LoginProvider.SSAFY, "settlement-" + UUID.randomUUID(),
                "G" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.MALE)).getId();
        wallets.saveAndFlush(Wallet.forSignup(id, Instant.now()));
        if (initial != 100) { jdbc.update("UPDATE wallets SET balance=? WHERE user_id=?", initial, id); }
        return id;
    }

    private GameFinished finish(Fixture game, int winners) {
        var players = new ArrayList<GameFinished.Participant>();
        for (int i = 0; i < game.users().length; i++) {
            players.add(new GameFinished.Participant(game.users()[i], winners == 0 ? GameFinished.Result.DRAW
                    : i < winners ? GameFinished.Result.WIN : GameFinished.Result.LOSE, null, null));
        }
        String reason = winners == 0 ? "BOARD_FULL" : game.command().gameCode().equals("OMOK") ? "FIVE_IN_ROW" : "STALEMATE";
        return new GameFinished(game.id() + ":finished", game.id(), game.command().tableId(), game.command().gameCode(),
                10, players, reason, Instant.now());
    }

    private void assertReserved(Fixture game) {
        for (long user : game.users()) {
            var wallet = wallets.findByUserId(user).orElseThrow();
            assertThat(wallet.balance()).isEqualTo(game.initial());
            assertThat(wallet.reserved()).isEqualTo(game.command().betAmountPerPlayer());
        }
    }

    private void assertPendingUnchanged(Fixture game) {
        assertReserved(game);
        assertThat(ledgerCount(game)).isEqualTo(game.users().length);
        var result = results.load(game.users()[0], game.id()).orElseThrow();
        assertThat(result.settlementStatus()).isEqualTo(GameResultView.SettlementStatus.PENDING);
        assertThat(result.myCoinDelta()).isNull();
    }

    private void assertSettled(Fixture game, long[] delta, long bonus) {
        long id = Long.parseLong(game.id());
        for (int i = 0; i < delta.length; i++) {
            var wallet = wallets.findByUserId(game.users()[i]).orElseThrow();
            assertThat(wallet.balance()).isEqualTo(game.initial() + delta[i]);
            assertThat(wallet.reserved()).isZero();
            var result = results.load(game.users()[i], game.id()).orElseThrow();
            assertThat(result.settlementStatus()).isEqualTo(GameResultView.SettlementStatus.SETTLED);
            assertThat(result.myCoinDelta()).isEqualTo(delta[i]);
            assertThat(jdbc.queryForObject("SELECT SUM(balance_delta) FROM wallet_transactions WHERE game_session_id=? AND wallet_id=?",
                    Long.class, id, wallet.id())).isEqualTo(delta[i]);
            assertThat(jdbc.queryForObject("SELECT SUM(reserved_delta) FROM wallet_transactions WHERE game_session_id=? AND wallet_id=?",
                    Long.class, id, wallet.id())).isZero();
        }
        assertThat(jdbc.queryForObject("SELECT SUM(balance_delta) FROM wallet_transactions WHERE game_session_id=?", Long.class, id)).isEqualTo(bonus);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_participants WHERE game_session_id=? AND reservation_released_at IS NULL",
                Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT active_table_id FROM game_sessions WHERE id=?", String.class, id)).isNull();
    }

    private long ledgerCount(Fixture game) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?", Long.class, Long.parseLong(game.id()));
    }

    private long committed(Fixture game, GameResultView.SettlementStatus status) {
        resultNotifications.dispatchOnce(100);
        return notifications.stream(GameResultCommitted.class).filter(e -> e.result().gameSessionId().equals(game.id())
                && e.result().settlementStatus() == status).count();
    }

    private String trigger(Fixture game, String type) {
        String name = "game173_fail_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE TRIGGER `" + name + "` BEFORE INSERT ON wallet_transactions FOR EACH ROW BEGIN "
                + "IF NEW.game_session_id=" + Long.parseLong(game.id()) + " AND NEW.transaction_type='" + type + "' THEN "
                + "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture rollback'; END IF; END");
        return name;
    }

    private <T> List<T> parallel(List<Callable<T>> tasks) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(tasks.size())) {
            var futures = tasks.stream().map(task -> executor.submit(() -> { start.await(); return task.call(); })).toList();
            start.countDown();
            List<T> output = new ArrayList<>();
            for (var future : futures) { output.add(future.get(30, TimeUnit.SECONDS)); }
            return output;
        }
    }

    private record Fixture(GameStartCommand command, String id, long[] users, long initial) { }
}
