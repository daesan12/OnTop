package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import com.ssafy.ontop.game.reconnect.ActiveGameLookup;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.JpaGameStartGateway;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 할리갈리의 시작 예약·엔진 활성화·종료 저장·정산을 신규 격리 MySQL 8.4에서 실제 경로로 검증한다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.game-start.enabled=true", "ontop.games.halligalli.enabled=true",
        "ontop.game-recovery.background-enabled=false",
        "ontop.shop.enabled=true", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "spring.datasource.hikari.maximum-pool-size=12"
})
class HalliGalliSettlementMySqlTests {
    @Autowired private JpaGameStartGateway starts;
    @Autowired private CommittedGameStartService committedStarts;
    @Autowired private GameSettlementPersistenceService settlements;
    @Autowired private GameEventDelivery delivery;
    @Autowired private GameFinishedPersistenceListener listener;
    @Autowired private JpaGameResultGateway results;
    @Autowired private HalliGalliEngine engine;
    @Autowired private GameEngineRouter router;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private ActiveGameLookup activeGames;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;

    @DynamicPropertySource static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_halligalli_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("할리갈리 정산은 신규 격리 ontop_game_test_halligalli_ DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    // V135가 V134 뒤에 성공으로 적용됐는지만 본다. 이후 마이그레이션이 추가돼도 할리갈리 CHECK가 남아 있으면 통과한다.
    @Test void 신규_DB에_V135가_적용되고_참가인원_CHECK에_기존게임과_할리갈리가_모두_있다() {
        MigrationInfo[] applied = flyway.info().applied();
        assertThat(applied).extracting(m -> m.getVersion().getVersion()).containsSubsequence("134", "135");
        MigrationInfo v135 = Arrays.stream(applied).filter(m -> "135".equals(m.getVersion().getVersion())).findFirst().orElseThrow();
        assertThat(v135.getScript()).isEqualTo("V135__allow_halli_galli_game_sessions.sql");
        assertThat(v135.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(jdbc.queryForObject("SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
                + "WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_game_sessions_players'", String.class)
                .replace("\\", "").replace("_utf8mb4", ""))
                .contains("'OMOK'", "'DICE'", "'ONE_CARD'", "'LIAR_BRIDGE'", "'DICE_LEDGER'", "'HALLI_GALLI'");
    }

    @Test void 참가인원_CHECK는_기존게임_제한을_유지하고_할리갈리는_2명부터_4명만_허용한다() {
        insert("OMOK", 2, null);
        insert("DICE", 2, 2000);
        for (String code : List.of("ONE_CARD", "LIAR_BRIDGE", "DICE_LEDGER", "HALLI_GALLI")) {
            for (int count = 2; count <= 4; count++) { insert(code, count, null); }
        }
        for (int count : new int[] {1, 5}) {
            assertThatThrownBy(() -> insert("HALLI_GALLI", count, null)).isInstanceOf(DataAccessException.class)
                    .hasMessageContaining("ck_game_sessions_players");
        }
        assertThatThrownBy(() -> insert("OMOK", 3, null)).hasMessageContaining("ck_game_sessions_players");
        assertThatThrownBy(() -> insert("DICE_LEDGER", 5, null)).hasMessageContaining("ck_game_sessions_players");
        assertThatThrownBy(() -> insert("HALLI_GALLI", 2, 2000)).hasMessageContaining("ck_game_sessions_target");
    }

    @ParameterizedTest @ValueSource(ints = {2, 3, 4})
    void 공통_시작으로_예약하면_참가비를_예약하고_커밋뒤_엔진을_활성화한다(int count) {
        var game = start(count, 7);

        assertReserved(game);
        assertThat(jdbc.queryForObject("SELECT status FROM game_sessions WHERE id=?", String.class,
                Long.parseLong(game.id()))).isEqualTo("RUNNING");
        assertThat(jdbc.queryForObject("SELECT game_code FROM game_sessions WHERE id=?", String.class,
                Long.parseLong(game.id()))).isEqualTo("HALLI_GALLI");
        var state = engine.load(game.users()[0], game.id()).orElseThrow().publicState();
        assertThat(state.path("gameCode").asText()).isEqualTo("HALLI_GALLI");
        assertThat(state.path("players")).hasSize(count);
        assertThat(router.load(game.users()[0]).orElseThrow().gameId()).isEqualTo(game.id());
        assertThat(committedStarts.find(game.command()).isReservationCommitted(game.command())).isTrue();
    }

    @Test void 실제엔진의_두명중_기권은_단독승자로_결과와_잔액을_정산한다() {
        var game = start(2, 9);

        engine.forfeit(new GameForfeitCommand(game.users()[0], game.id(), UUID.randomUUID().toString()));
        delivery.drain(100);

        assertSettled(game, new long[] {-9, 9}, 0);
        assertThat(results(game)).containsExactly("FORFEIT", "WIN");
        assertThat(jdbc.queryForObject("SELECT leave_reason FROM game_participants WHERE game_session_id=? AND user_id=?",
                String.class, Long.parseLong(game.id()), game.users()[0])).isEqualTo("EXPLICIT_LEAVE");
        assertThat(jdbc.queryForObject("SELECT end_reason FROM game_sessions WHERE id=?", String.class,
                Long.parseLong(game.id()))).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(committedStarts.find(game.command()).code()).isEqualTo("GAME_ALREADY_TERMINATED");
    }

    @Test void 카드수_공동승자는_판돈을_균등지급하고_나머지는_GAME_TIE_BONUS로_기록한다() {
        var game = reserve(3, 5);

        listener.finished(finish(game, "CARD_COUNT", outcome(WIN), outcome(WIN), outcome(LOSE)));

        assertSettled(game, new long[] {3, 3, -5}, 1);
        assertThat(sum(game, "GAME_SETTLEMENT")).isZero();
        assertThat(sum(game, "GAME_TIE_BONUS")).isEqualTo(1);
        assertThat(results(game)).containsExactly("WIN", "WIN", "LOSE");
    }

    @Test void 기권자를_포함한_공동승자는_기권자를_FORFEIT으로_차감하고_보너스를_나눈다() {
        var game = reserve(4, 10);
        Instant leftAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        listener.finished(finish(game, "NO_CARDS_TO_FLIP", outcome(WIN), outcome(WIN), outcome(WIN),
                new GameFinished.Participant(0, GameFinished.Result.FORFEIT, GameDepartureReason.DISCONNECT_TIMEOUT, leftAt)));

        assertSettled(game, new long[] {4, 4, 4, -10}, 2);
        assertThat(results(game)).containsExactly("WIN", "WIN", "WIN", "FORFEIT");
        assertThat(jdbc.queryForObject("SELECT leave_reason FROM game_participants WHERE game_session_id=? AND user_id=?",
                String.class, Long.parseLong(game.id()), game.users()[3])).isEqualTo("DISCONNECT_TIMEOUT");
    }

    @Test void 규칙상_탈락자_LOSE와_기권자_FORFEIT을_구분해_저장한다() {
        var game = reserve(4, 10);
        Instant leftAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        listener.finished(finish(game, "CARD_COUNT", outcome(WIN), outcome(WIN), outcome(LOSE),
                new GameFinished.Participant(0, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, leftAt)));

        assertSettled(game, new long[] {10, 10, -10, -10}, 0);
        assertThat(results(game)).containsExactly("WIN", "WIN", "LOSE", "FORFEIT");
    }

    @Test void 최후1인의_복수승자와_다른게임의_종료사유는_저장하지_않고_예약을_유지한다() {
        var game = reserve(3, 5);

        assertThatThrownBy(() -> listener.finished(finish(game, "LAST_PLAYER_STANDING",
                outcome(WIN), outcome(WIN), outcome(LOSE)))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> listener.finished(finish(game, "ALL_CATEGORIES_FILLED",
                outcome(WIN), outcome(LOSE), outcome(LOSE)))).isInstanceOf(IllegalArgumentException.class);

        assertReserved(game);
        assertThat(ledgerCount(game)).isEqualTo(3);
    }

    @Test void 동일종료의_재처리와_동시_중복요청도_잔액과_원장을_한번만_반영한다() throws Exception {
        var game = reserve(3, 5);
        GameFinished event = finish(game, "CARD_COUNT", outcome(WIN), outcome(WIN), outcome(LOSE));

        parallel(IntStream.range(0, 8).<Callable<Void>>mapToObj(i -> () -> { listener.finished(event); return null; })
                .toList());
        long before = ledgerCount(game);
        listener.finished(event);
        settlements.settle(Long.parseLong(game.id()));

        assertSettled(game, new long[] {3, 3, -5}, 1);
        assertThat(ledgerCount(game)).isEqualTo(before).isEqualTo(7);
        assertThat(results.load(game.users()[0], game.id()).orElseThrow().version()).isEqualTo(2);
    }

    private static final GameFinished.Result WIN = GameFinished.Result.WIN;
    private static final GameFinished.Result LOSE = GameFinished.Result.LOSE;

    private static GameFinished.Participant outcome(GameFinished.Result result) {
        return new GameFinished.Participant(0, result, null, null);
    }

    // outcome의 userId 0은 같은 순서의 실제 참가자로 바꾼다.
    private GameFinished finish(Fixture game, String reason, GameFinished.Participant... outcomes) {
        var players = new ArrayList<GameFinished.Participant>();
        for (int i = 0; i < outcomes.length; i++) {
            players.add(new GameFinished.Participant(game.users()[i], outcomes[i].result(), outcomes[i].leaveReason(),
                    outcomes[i].leftAt()));
        }
        return new GameFinished(game.id() + ":finished", game.id(), game.command().tableId(), "HALLI_GALLI", 10,
                players, reason, Instant.now());
    }

    private void insert(String code, int count, Integer target) {
        jdbc.update("""
                INSERT INTO game_sessions(start_attempt_id,request_fingerprint,table_id,table_version,game_code,
                    target_score,participant_count,bet_amount_per_player,total_pot,status,
                    owner_instance_id,owner_boot_id,created_at)
                VALUES (UUID_TO_BIN(UUID()),UNHEX(REPEAT('00',32)),CONCAT('halligalli-check-',UUID()),0,?,
                    ?,?,1,?,'PREPARING','fixture',UUID_TO_BIN(UUID()),UTC_TIMESTAMP(3))
                """, code, target, count, count);
    }

    private Fixture start(int count, long bet) {
        Fixture game = command(count, bet);
        GameStartResult result = committedStarts.start(game.command());
        assertThat(result.isReservationCommitted(game.command())).isTrue();
        return new Fixture(game.command(), result.gameSessionId(), game.users(), game.initial());
    }

    private Fixture reserve(int count, long bet) {
        Fixture game = command(count, bet);
        GameStartResult result = starts.startGame(game.command());
        assertThat(result.isReservationCommitted(game.command())).isTrue();
        return new Fixture(game.command(), result.gameSessionId(), game.users(), game.initial());
    }

    private Fixture command(int count, long bet) {
        long initial = Math.max(100, bet);
        long[] players = IntStream.range(0, count).mapToLong(i -> member(initial)).toArray();
        var command = new GameStartCommand(UUID.randomUUID(), "halligalli-" + UUID.randomUUID(), 1, "HALLI_GALLI",
                IntStream.range(0, count).mapToObj(i -> new GameStartCommand.Participant(Long.toString(players[i]), i + 1))
                        .toList(), null, bet);
        return new Fixture(command, null, players, initial);
    }

    private long member(long initial) {
        long id = users.saveAndFlush(new User(LoginProvider.SSAFY, "halligalli-" + UUID.randomUUID(),
                "H" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.MALE)).getId();
        wallets.saveAndFlush(Wallet.forSignup(id, Instant.now()));
        if (initial != 100) { jdbc.update("UPDATE wallets SET balance=? WHERE user_id=?", initial, id); }
        return id;
    }

    private void assertReserved(Fixture game) {
        for (long user : game.users()) {
            var wallet = wallets.findByUserId(user).orElseThrow();
            assertThat(wallet.balance()).isEqualTo(game.initial());
            assertThat(wallet.reserved()).isEqualTo(game.command().betAmountPerPlayer());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=? "
                + "AND transaction_type='GAME_RESERVE'", Integer.class, Long.parseLong(game.id())))
                .isEqualTo(game.users().length);
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
        assertThat(jdbc.queryForObject("SELECT SUM(balance_delta) FROM wallet_transactions WHERE game_session_id=?", Long.class, id))
                .isEqualTo(bonus);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_participants WHERE game_session_id=? AND reservation_released_at IS NULL",
                Integer.class, id)).isZero();
        assertThat(jdbc.queryForObject("SELECT active_table_id FROM game_sessions WHERE id=?", String.class, id)).isNull();
        for (long user : game.users()) {
            assertThat(activeGames.findByUserId(user)).isEmpty();
        }
    }

    private List<String> results(Fixture game) {
        return jdbc.queryForList("SELECT result FROM game_participants WHERE game_session_id=? ORDER BY participant_order",
                String.class, Long.parseLong(game.id()));
    }

    private Long sum(Fixture game, String type) {
        return jdbc.queryForObject("SELECT COALESCE(SUM(balance_delta),0) FROM wallet_transactions WHERE game_session_id=? "
                + "AND transaction_type=?", Long.class, Long.parseLong(game.id()), type);
    }

    private long ledgerCount(Fixture game) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?", Long.class,
                Long.parseLong(game.id()));
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
