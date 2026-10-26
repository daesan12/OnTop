package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.shop.ShopException;
import com.ssafy.ontop.shop.service.ShopService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManagerFactory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.event.spi.EventType;
import org.hibernate.event.spi.PostLoadEvent;
import org.hibernate.event.spi.PostLoadEventListener;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;

@Tag("mysql")
@Import(GameStartMySqlTests.ProbeConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.game-start.enabled=true", "ontop.games.omok.enabled=true",
        "ontop.game-recovery.background-enabled=false",
        "ontop.shop.enabled=true", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "spring.datasource.hikari.maximum-pool-size=12"
})
class GameStartMySqlTests {
    @Autowired private JpaGameStartGateway gateway;
    @Autowired private CommittedGameStartService starts;
    @Autowired private WalletRepository wallets;
    @Autowired private WalletTransactionRepository ledger;
    @Autowired private UserRepository users;
    @MockitoSpyBean private GameSessionRepository sessions;
    @Autowired private UserWithdrawalPersistenceService withdrawal;
    @Autowired private ShopService shop;
    @Autowired private MinigameService minigames;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager manager;
    @Autowired private EntityManagerFactory entities;
    @Autowired private Flyway flyway;
    @Autowired private UserLockProbe probe;

    @AfterEach
    void clearProbe() {
        probe.clear();
    }

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("경기 예약은 신규 격리 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @Test
    void 신규_DB에_기본과_선택적_마이그레이션을_적용하고_JPA_validate와_재실행을_검증한다() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion())
                .containsExactly("1", "2", "3", "4", "5", "6", "100", "110", "111", "112", "122", "123", "124");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(entities.getProperties()).containsEntry("hibernate.hbm2ddl.auto", "validate");
        assertThat(entities.getMetamodel().getEntities()).extracting(type -> type.getJavaType().getName())
                .contains(GameSession.class.getName(), GameParticipant.class.getName());
        assertThat(jdbc.queryForList("""
                SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN ('game_participants','wallet_transactions')
                """, String.class)).contains("fk_game_participants_user", "fk_game_participants_session",
                        "fk_wallet_transactions_game_session");
    }

    @ParameterizedTest
    @ValueSource(strings = {"OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE"})
    void 네_게임의_전원예약은_잔액을_유지하고_예약액과_원장을_함께_저장한다(String code) {
        long[] players = code.equals("ONE_CARD") || code.equals("LIAR_BRIDGE")
                ? new long[]{member(), member(), member(), member()} : new long[]{member(), member()};
        var command = command(code, players);
        GameStartResult result = gateway.startGame(command);

        assertReserved(command, result);
        long id = GameIdCodec.parse(result.gameSessionId());
        for (long userId : players) {
            Wallet wallet = wallets.findByUserId(userId).orElseThrow();
            assertThat(wallet.balance()).isEqualTo(100);
            assertThat(wallet.reserved()).isEqualTo(1);
            assertThat(wallet.balance() - wallet.reserved()).isEqualTo(99);
            assertThat(jdbc.queryForMap("""
                    SELECT transaction_type,balance_delta,reserved_delta,idempotency_key
                    FROM wallet_transactions WHERE game_session_id=? AND wallet_id=?
                    """, id, wallet.id())).containsEntry("transaction_type", "GAME_RESERVE")
                    .containsEntry("balance_delta", 0L).containsEntry("reserved_delta", 1L)
                    .containsEntry("idempotency_key", "game:" + id + ":reserve:" + userId);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_participants WHERE game_session_id=?",
                Integer.class, id)).isEqualTo(players.length);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_sessions WHERE id=? AND status='RESERVED'"
                + " AND settlement_status='PENDING' AND reserved_at IS NOT NULL AND started_at IS NULL"
                + " AND ended_at IS NULL AND settled_at IS NULL AND owner_boot_id IS NOT NULL", Integer.class, id))
                .isEqualTo(1);
    }

    @Test
    void 같은_시도는_한번만_예약하고_조회는_최초_참가순서와_금액을_재현한다() {
        long first = member();
        long second = member();
        var command = new GameStartCommand(UUID.randomUUID(), table(), 3, "OMOK", List.of(
                new GameStartCommand.Participant(Long.toString(second), 4),
                new GameStartCommand.Participant(Long.toString(first), 1)));
        var result = gateway.startGame(command);

        assertThat(gateway.startGame(command)).isEqualTo(result);
        assertThat(gateway.findStartResult(command.startAttemptId())).isEqualTo(result);
        assertThat(wallets.findByUserId(first).orElseThrow().reserved()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?",
                Integer.class, GameIdCodec.parse(result.gameSessionId()))).isEqualTo(2);
    }

    @Test
    void 같은_시도의_다른_요청은_CONFLICT이며_기존예약을_보존한다() {
        var command = command("OMOK", member(), member());
        var result = gateway.startGame(command);
        var changed = new GameStartCommand(command.startAttemptId(), command.tableId(), 2, command.gameCode(),
                command.participants());
        assertThat(gateway.startGame(changed).outcome()).isEqualTo(GameStartResult.Outcome.CONFLICT);
        assertThat(gateway.findStartResult(command.startAttemptId())).isEqualTo(result);
    }

    @Test
    void 잔액부족은_전원_무변경으로_거절되고_잔액이_늘어도_같은시도는_거절을_재조회한다() {
        long owner = member();
        long poor = member();
        jdbc.update("UPDATE wallets SET reserved_balance=balance WHERE user_id=?", poor);
        var command = command("OMOK", owner, poor);
        var result = gateway.startGame(command);

        assertThat(result.code()).isEqualTo("INSUFFICIENT_BALANCE");
        jdbc.update("UPDATE wallets SET reserved_balance=0 WHERE user_id=?", poor);
        assertThat(gateway.startGame(command)).isEqualTo(result);
        assertThat(gateway.findStartResult(command.startAttemptId())).isEqualTo(result);
        assertNoReservation(command, owner, poor);
    }

    @Test
    void 지갑_미생성_회원에게_자동생성이나_가입보너스를_지급하지않는다() {
        long owner = member();
        long missing = user().getId();
        var command = command("OMOK", owner, missing);
        assertThat(gateway.startGame(command).code()).isEqualTo("WALLET_NOT_READY");
        assertThat(wallets.findByUserId(missing)).isEmpty();
        assertNoReservation(command, owner);
    }

    @Test
    void 탈퇴회원과_존재하지않는_회원은_예약하지않는다() {
        long active = member();
        long inactive = member();
        withdrawal.withdraw(inactive);
        var withdrawn = command("OMOK", active, inactive);
        assertThat(gateway.startGame(withdrawn).code()).isEqualTo("MEMBER_NOT_ACTIVE");
        assertNoReservation(withdrawn, active, inactive);
        var missing = command("OMOK", active, Long.MAX_VALUE);
        assertThat(gateway.startGame(missing).code()).isEqualTo("MEMBER_NOT_ACTIVE");
        assertNoReservation(missing, active);
    }

    @Test
    void 이탈했어도_정산전_예약이_남으면_다른경기_참가를_거절한다() {
        long owner = member();
        var first = gateway.startGame(command("OMOK", owner, member()));
        jdbc.update("UPDATE game_participants SET participant_status='LEFT',leave_reason='LOGOUT',"
                + "left_at=UTC_TIMESTAMP(3) WHERE game_session_id=? AND user_id=?",
                GameIdCodec.parse(first.gameSessionId()), owner);
        var next = command("OMOK", owner, member());

        assertThat(gateway.startGame(next).code()).isEqualTo("MEMBER_ALREADY_IN_GAME");
        assertThat(wallets.findByUserId(owner).orElseThrow().reserved()).isEqualTo(1);
        assertThat(gateway.findStartResult(next.startAttemptId()).code()).isEqualTo("MEMBER_ALREADY_IN_GAME");
    }

    @Test
    void 같은_테이블_중복시작은_DB_UNIQUE_충돌후에도_거절결과를_영속화한다() {
        var first = command("OMOK", member(), member());
        gateway.startGame(first);
        var second = new GameStartCommand(UUID.randomUUID(), first.tableId(), 2, "OMOK",
                command("OMOK", member(), member()).participants());
        // 사전 조회가 경합으로 놓치는 상황에서도 실제 UNIQUE를 최종 안전장치로 사용한다.
        doReturn(false).when(sessions).existsByActiveTableId(first.tableId());
        var result = gateway.startGame(second);

        assertThat(result.code()).isEqualTo("TABLE_ALREADY_IN_GAME");
        assertThat(gateway.findStartResult(second.startAttemptId())).isEqualTo(result);
        assertNoReservation(second, second.participants().stream().mapToLong(p -> Long.parseLong(p.userId())).toArray());
    }

    @Test
    void 동일_시도_동시8회는_한_경기와_한번의_예약만_생성한다() throws Exception {
        var command = command("OMOK", member(), member());
        List<GameStartResult> results = parallel(java.util.stream.IntStream.range(0, 8)
                .<Callable<GameStartResult>>mapToObj(index -> () -> gateway.startGame(command)).toList());

        assertThat(results).allSatisfy(result -> assertReserved(command, result));
        assertThat(results).extracting(GameStartResult::gameSessionId).containsOnly(results.getFirst().gameSessionId());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?",
                Integer.class, GameIdCodec.parse(results.getFirst().gameSessionId()))).isEqualTo(2);
    }

    @Test
    void 같은_시도의_다른내용_동시요청도_한번만_예약하고_다른쪽은_CONFLICT다() throws Exception {
        var first = command("OMOK", member(), member());
        var changed = new GameStartCommand(first.startAttemptId(), first.tableId(), 2, first.gameCode(),
                first.participants());
        List<GameStartResult> results = parallel(List.of(() -> gateway.startGame(first), () -> gateway.startGame(changed)));

        assertThat(results).extracting(GameStartResult::outcome)
                .containsExactlyInAnyOrder(GameStartResult.Outcome.RESERVED, GameStartResult.Outcome.CONFLICT);
        var stored = gateway.findStartResult(first.startAttemptId());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?",
                Integer.class, GameIdCodec.parse(stored.gameSessionId()))).isEqualTo(2);
    }

    @Test
    void 활성회원_UNIQUE는_다른_경기로_직접_추가하는_중복참가도_거절한다() {
        long owner = member();
        gateway.startGame(command("OMOK", owner, member()));
        var other = gateway.startGame(command("OMOK", member(), member()));

        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET user_id=?"
                + " WHERE game_session_id=? AND participant_order=0", owner, GameIdCodec.parse(other.gameSessionId())))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("uk_game_participants_active_user");
    }

    @Test
    void 동일회원의_서로다른_경기_경합은_한쪽만_예약한다() throws Exception {
        long owner = member();
        var first = command("OMOK", owner, member());
        var second = command("OMOK", member(), owner);
        List<GameStartResult> results = parallel(List.of(() -> gateway.startGame(first), () -> gateway.startGame(second)));

        assertThat(results).extracting(GameStartResult::outcome)
                .containsExactlyInAnyOrder(GameStartResult.Outcome.RESERVED, GameStartResult.Outcome.REJECTED);
        assertThat(wallets.findByUserId(owner).orElseThrow().reserved()).isEqualTo(1);
    }

    @Test
    void 동일테이블의_서로다른_회원집합_경합은_한쪽만_예약한다() throws Exception {
        var first = command("OMOK", member(), member());
        var second = new GameStartCommand(UUID.randomUUID(), first.tableId(), 2, "OMOK",
                command("OMOK", member(), member()).participants());
        List<GameStartResult> results = parallel(List.of(() -> gateway.startGame(first), () -> gateway.startGame(second)));

        assertThat(results).extracting(GameStartResult::outcome)
                .containsExactlyInAnyOrder(GameStartResult.Outcome.RESERVED, GameStartResult.Outcome.REJECTED);
    }

    @Test
    void 두번째_원장저장_실패는_첫번째_예약과_참가자와_경기까지_롤백한다() {
        long first = member();
        long second = member();
        var command = command("OMOK", first, second);
        long originalLedger = ledger.count();
        long secondWallet = wallets.findByUserId(second).orElseThrow().id();
        jdbc.execute("CREATE TRIGGER game_test_fail_second_ledger BEFORE INSERT ON wallet_transactions FOR EACH ROW "
                + "BEGIN IF NEW.transaction_type='GAME_RESERVE' AND NEW.wallet_id=" + secondWallet
                + " THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture-ledger-failure'; END IF; END");
        try {
            assertThat(gateway.startGame(command).outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
            assertThat(sessions.findByStartAttemptId(command.startAttemptId())).isEmpty();
            assertThat(wallets.findByUserId(first).orElseThrow().reserved()).isZero();
            assertThat(wallets.findByUserId(second).orElseThrow().reserved()).isZero();
            assertThat(ledger.count()).isEqualTo(originalLedger);
            assertThat(gateway.findStartResult(command.startAttemptId()).outcome())
                    .isEqualTo(GameStartResult.Outcome.PENDING);
        } finally {
            jdbc.execute("DROP TRIGGER game_test_fail_second_ledger");
        }
    }

    @Test
    void Shop이_Wallet을_먼저_잠근_상태에서도_User_공유잠금은_FK검사와_호환된다() throws Exception {
        long owner = member();
        var command = command("OMOK", owner, member());
        long item = item(10);
        CountDownLatch walletHeld = new CountDownLatch(1);
        CountDownLatch userShared = new CountDownLatch(1);
        probe.watch(owner, userShared::countDown);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var purchase = executor.submit(() -> transaction().execute(tx -> {
                wallets.findForUpdateByUserId(owner).orElseThrow();
                walletHeld.countDown();
                await(userShared);
                return shop.purchase(owner, item, 1, UUID.randomUUID().toString());
            }));
            await(walletHeld);
            var reserve = executor.submit(() -> gateway.startGame(command));

            assertThat(purchase.get(20, TimeUnit.SECONDS).balanceAfter()).isEqualTo(90);
            assertReserved(command, reserve.get(20, TimeUnit.SECONDS));
        }
        assertThat(wallets.findByUserId(owner).orElseThrow().reserved()).isEqualTo(1);
    }

    @Test
    void 구매와_예약이_마지막_잔액을_경합해도_초과사용하지않는다() throws Exception {
        long owner = member();
        var command = command("OMOK", owner, member());
        long item = item(100);
        var outcomes = parallel(List.<Callable<String>>of(
                () -> gateway.startGame(command).outcome().name(),
                () -> {
                    try { shop.purchase(owner, item, 1, UUID.randomUUID().toString()); return "PURCHASED"; }
                    catch (ShopException exception) { return "PURCHASE_REJECTED"; }
                }));
        Wallet wallet = wallets.findByUserId(owner).orElseThrow();
        assertThat(wallet.balance()).isGreaterThanOrEqualTo(wallet.reserved());
        assertThat(outcomes).isIn(List.of("RESERVED", "PURCHASE_REJECTED"), List.of("REJECTED", "PURCHASED"));
    }

    @Test
    void Minigame의_Wallet선잠금과_세션_FK저장도_게임의_User공유잠금과_호환된다() throws Exception {
        long owner = member();
        var command = command("OMOK", owner, member());
        CountDownLatch walletHeld = new CountDownLatch(1);
        CountDownLatch userShared = new CountDownLatch(1);
        probe.watch(owner, userShared::countDown);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var mini = executor.submit(() -> transaction().execute(tx -> {
                wallets.findForUpdateByUserId(owner).orElseThrow();
                walletHeld.countDown();
                await(userShared);
                return minigames.start(owner, "BUNGEOPPANG", UUID.randomUUID().toString());
            }));
            await(walletHeld);
            var reserve = executor.submit(() -> gateway.startGame(command));

            assertThat(mini.get(20, TimeUnit.SECONDS).status()).isEqualTo("PLAYING");
            assertReserved(command, reserve.get(20, TimeUnit.SECONDS));
        }
    }

    @Test
    void 예약이_User공유잠금을_먼저잡으면_탈퇴는_예약커밋까지_기다린다() throws Exception {
        long owner = member();
        var command = command("OMOK", owner, member());
        CountDownLatch userShared = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        probe.watch(owner, () -> {
            userShared.countDown();
            await(proceed);
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var reserve = executor.submit(() -> gateway.startGame(command));
            await(userShared);
            var remove = executor.submit(() -> withdrawal.withdraw(owner));
            proceed.countDown();

            assertReserved(command, reserve.get(20, TimeUnit.SECONDS));
            remove.get(20, TimeUnit.SECONDS);
        }
        assertThat(users.findById(owner).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(wallets.findByUserId(owner).orElseThrow().reserved()).isEqualTo(1);
    }

    @Test
    void 탈퇴가_User쓰기잠금을_먼저잡으면_예약은_최신_비활성상태로_거절한다() throws Exception {
        long owner = member();
        var command = command("OMOK", owner, member());
        CountDownLatch userExclusive = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        probe.watch(owner, () -> {
            userExclusive.countDown();
            await(proceed);
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var remove = executor.submit(() -> withdrawal.withdraw(owner));
            await(userExclusive);
            var reserve = executor.submit(() -> gateway.startGame(command));
            proceed.countDown();
            remove.get(20, TimeUnit.SECONDS);

            assertThat(reserve.get(20, TimeUnit.SECONDS).code()).isEqualTo("MEMBER_NOT_ACTIVE");
        }
        assertNoReservation(command, owner);
    }

    @Test
    void 실제_DB_예약결과의_십진수_ID를_기존_오목엔진에_전달한다() {
        var command = command("OMOK", member(), member());
        var result = starts.start(command);
        assertReserved(command, result);
        assertThat(starts.find(command)).isEqualTo(result);
    }

    @Test
    void FK와_좌석_및_게임인원_CHECK를_DB가_최종_보장한다() {
        var command = command("OMOK", member(), member());
        var result = gateway.startGame(command);
        long id = GameIdCodec.parse(result.gameSessionId());
        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET seat_number=0 WHERE game_session_id=?", id))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("ck_game_participants_seat");
        assertThatThrownBy(() -> jdbc.update("UPDATE game_sessions SET participant_count=3,total_pot=3 WHERE id=?", id))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("ck_game_sessions_players");
        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET user_id=? WHERE game_session_id=?",
                Long.MAX_VALUE, id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE wallet_transactions SET game_session_id=? WHERE game_session_id=?",
                Long.MAX_VALUE, id)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void 가변참가비를_저장하고_같은시도의_금액변조를_거절한다() {
        var original = command("OMOK", member(), member());
        var command = new GameStartCommand(original.startAttemptId(), original.tableId(), original.tableVersion(),
                original.gameCode(), original.participants(), null, 30);
        var reserved = gateway.startGame(command);
        assertReserved(command, reserved);
        assertThat(reserved.reservedAmountPerPlayer()).isEqualTo(30);
        assertThat(reserved.totalReservedAmount()).isEqualTo(60);
        assertThat(gateway.findStartResult(command.startAttemptId())).isEqualTo(reserved);
        for (var player : command.participants()) {
            var wallet = wallets.findByUserId(Long.parseLong(player.userId())).orElseThrow();
            assertThat(wallet.balance()).isEqualTo(100);
            assertThat(wallet.reserved()).isEqualTo(30);
        }
        var changed = new GameStartCommand(command.startAttemptId(), command.tableId(), command.tableVersion(),
                command.gameCode(), command.participants(), null, 40);
        assertThat(gateway.startGame(changed).outcome()).isEqualTo(GameStartResult.Outcome.CONFLICT);
        assertThat(jdbc.queryForObject("SELECT SUM(reserved_delta) FROM wallet_transactions WHERE game_session_id=?",
                Long.class, Long.parseLong(reserved.gameSessionId()))).isEqualTo(60);
    }

    @Test
    void 가변참가비의_잔액부족은_전원예약을_거절한다() {
        var original = command("OMOK", member(), member());
        var command = new GameStartCommand(original.startAttemptId(), original.tableId(), 1, "OMOK", original.participants(), null, 101);
        assertThat(gateway.startGame(command).code()).isEqualTo("INSUFFICIENT_BALANCE");
        assertNoReservation(command, command.participants().stream().mapToLong(p -> Long.parseLong(p.userId())).toArray());
    }

    @Test
    void 같은시도의_다른참가비_경합도_한번만_예약한다() throws Exception {
        var base = command("OMOK", member(), member());
        var first = new GameStartCommand(base.startAttemptId(), base.tableId(), 1, "OMOK", base.participants(), null, 30);
        var second = new GameStartCommand(base.startAttemptId(), base.tableId(), 1, "OMOK", base.participants(), null, 40);
        List<GameStartResult> output = parallel(List.of(() -> gateway.startGame(first), () -> gateway.startGame(second)));
        assertThat(output).extracting(GameStartResult::outcome)
                .containsExactlyInAnyOrder(GameStartResult.Outcome.RESERVED, GameStartResult.Outcome.CONFLICT);
        var stored = gateway.findStartResult(base.startAttemptId());
        assertThat(jdbc.queryForObject("SELECT SUM(reserved_delta) FROM wallet_transactions WHERE game_session_id=?",
                Long.class, Long.parseLong(stored.gameSessionId()))).isEqualTo(stored.totalReservedAmount());
    }

    @Test
    void 현재두명이어도_네명게임의_최대인원_범위를_예약전에_확인한다() {
        var base = command("ONE_CARD", member(), member());
        var tooLarge = new GameStartCommand(base.startAttemptId(), base.tableId(), 1, "ONE_CARD", base.participants(), null,
                com.ssafy.ontop.game.domain.GameAmounts.MAX_SAFE_INTEGER / 4 + 1);
        assertThatThrownBy(() -> gateway.startGame(tooLarge)).isInstanceOf(IllegalArgumentException.class);
        assertThat(sessions.findByStartAttemptId(base.startAttemptId())).isEmpty();
    }

    @Test
    void 가변예약과_구매가_경합해도_예약금액을_초과사용하지않는다() throws Exception {
        long owner = member();
        var base = command("OMOK", owner, member());
        var command = new GameStartCommand(base.startAttemptId(), base.tableId(), 1, "OMOK", base.participants(), null, 60);
        long product = item(60);
        var outcome = parallel(List.<Callable<String>>of(
                () -> gateway.startGame(command).outcome().name(),
                () -> { try { shop.purchase(owner, product, 1, UUID.randomUUID().toString()); return "PURCHASED"; }
                    catch (ShopException error) { return "PURCHASE_REJECTED"; } }));
        assertThat(outcome).isIn(List.of("RESERVED", "PURCHASE_REJECTED"), List.of("REJECTED", "PURCHASED"));
        var wallet = wallets.findByUserId(owner).orElseThrow();
        assertThat(wallet.balance()).isGreaterThanOrEqualTo(wallet.reserved());
    }

    private User user() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "game-test-" + UUID.randomUUID(),
                UUID.randomUUID().toString().replace("-", "").substring(0, 8), CharacterGender.MALE));
    }

    private long member() {
        long id = user().getId();
        wallets.saveAndFlush(Wallet.forSignup(id, Instant.now()));
        return id;
    }

    private GameStartCommand command(String code, long... players) {
        return new GameStartCommand(UUID.randomUUID(), table(), 1, code,
                java.util.stream.IntStream.range(0, players.length).mapToObj(index ->
                        new GameStartCommand.Participant(Long.toString(players[index]), index + 1)).toList(),
                code.equals("DICE") ? 2000 : null);
    }

    private String table() { return "game-test-" + UUID.randomUUID(); }

    private void assertReserved(GameStartCommand command, GameStartResult result) {
        assertThat(result.isReservationCommitted(command)).isTrue();
        assertThat(GameIdCodec.parse(result.gameSessionId())).isPositive();
    }

    private void assertNoReservation(GameStartCommand command, long... players) {
        long id = sessions.findByStartAttemptId(command.startAttemptId()).orElseThrow().id();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_participants WHERE game_session_id=?",
                Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?",
                Integer.class, id)).isZero();
        for (long user : players) {
            assertThat(wallets.findByUserId(user).orElseThrow().reserved()).isZero();
        }
    }

    private long item(long price) {
        String code = "game-item-" + UUID.randomUUID();
        jdbc.update("INSERT INTO items(item_code,name,item_type,price,image_key,is_for_sale)"
                + " VALUES (?,'경합물품','CONSUMABLE',?,'fixture',true)", code, price);
        return jdbc.queryForObject("SELECT id FROM items WHERE item_code=?", Long.class, code);
    }

    private TransactionTemplate transaction() {
        var tx = new TransactionTemplate(manager);
        tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        tx.setTimeout(15);
        return tx;
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) { throw new IllegalStateException("경합 검증 대기 시간 초과"); }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("경합 검증 중단", exception);
        }
    }

    private <T> List<T> parallel(List<Callable<T>> calls) throws Exception {
        CountDownLatch ready = new CountDownLatch(calls.size());
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(calls.size())) {
            var futures = calls.stream().map(call -> executor.submit(() -> {
                ready.countDown();
                await(start);
                return call.call();
            })).toList();
            await(ready);
            start.countDown();
            var results = new java.util.ArrayList<T>();
            for (var future : futures) { results.add(future.get(25, TimeUnit.SECONDS)); }
            return results;
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProbeConfiguration {
        @Bean
        UserLockProbe userLockProbe(EntityManagerFactory factory) {
            UserLockProbe probe = new UserLockProbe();
            factory.unwrap(SessionFactoryImplementor.class).getServiceRegistry()
                    .getService(EventListenerRegistry.class).appendListeners(EventType.POST_LOAD, probe);
            return probe;
        }
    }

    // SQL 실행과 잠금 획득 후의 실제 엔티티 로드만 관찰한다. Repository 쿼리를 대체하지 않는다.
    static class UserLockProbe implements PostLoadEventListener {
        private volatile long userId;
        private volatile Runnable callback = () -> { };

        void watch(long userId, Runnable callback) {
            this.callback = callback;
            this.userId = userId;
        }

        void clear() {
            userId = 0;
            callback = () -> { };
        }

        @Override
        public void onPostLoad(PostLoadEvent event) {
            if (event.getEntity() instanceof User user && user.getId() == userId) {
                callback.run();
            }
        }
    }
}
