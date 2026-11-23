package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Cell;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Goal;
import com.ssafy.ontop.game.quoridor.service.QuoridorEngine;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

import static org.assertj.core.api.Assertions.assertThat;

/** 담당자가 최신 스키마를 준비한 별도 MySQL에서만 실행한다. 이 테스트는 migration을 적용하지 않는다. */
@Tag("mysql")
@RecordApplicationEvents
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "server.address=127.0.0.1",
        "ontop.game-start.enabled=true", "ontop.games.quoridor.enabled=true",
        "ontop.game-recovery.background-enabled=false", "spring.flyway.enabled=false"
})
class QuoridorSettlementMySqlTests {
    @Autowired private CommittedGameStartService starts;
    @Autowired private QuoridorEngine engine;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private JpaGameResultGateway results;
    @Autowired private GameSettlementPersistenceService settlements;
    @Autowired private GameEventDelivery delivery;
    @Autowired private ApplicationEvents recorded;
    @Autowired private ApplicationEventPublisher events;
    @Autowired private ObjectMapper mapper;
    @Autowired private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_quoridor_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("길목 한 수 정산은 준비된 전용 loopback 검증 DB에서만 실행합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @ParameterizedTest
    @CsvSource({"2,0,false", "2,7,false", "4,7,false", "2,7,true", "4,7,true"})
    void 실제_DB의_기권과_도착_정산은_예약잔액과_원장을_한번만_확정한다(
            int count, long bet, boolean goal) {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='186' "
                + "AND success=1", Integer.class)).isEqualTo(1);
        List<Long> members = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            long user = users.saveAndFlush(new User(LoginProvider.SSAFY, "quoridor-" + UUID.randomUUID(),
                    "Q" + UUID.randomUUID().toString().substring(0, 7), CharacterGender.MALE)).getId();
            wallets.saveAndFlush(Wallet.forSignup(user, Instant.now()));
            members.add(user);
        }
        var command = new GameStartCommand(UUID.randomUUID(), "quoridor-db-" + UUID.randomUUID(), 1, "QUORIDOR",
                IntStream.range(0, count).mapToObj(i -> new GameStartCommand.Participant(
                        members.get(i).toString(), i + 1)).toList(), null, bet);
        var started = starts.start(command);
        assertThat(started.isReservationCommitted(command)).isTrue();
        String game = started.gameSessionId();
        for (long user : members) {
            assertThat(wallets.findByUserId(user).orElseThrow().balance()).isEqualTo(100);
            assertThat(wallets.findByUserId(user).orElseThrow().reserved()).isEqualTo(bet);
        }

        if (goal) {
            for (int step = 0; step < 100; step++) {
                var state = engine.load(members.getFirst(), game).orElseThrow();
                var board = state.publicState();
                if (board.path("status").asText().equals("FINISHED")) { break; }
                long actor = board.path("turnUserId").asLong();
                var player = java.util.stream.StreamSupport.stream(board.path("players").spliterator(), false)
                        .filter(p -> p.path("userId").asLong() == actor).findFirst().orElseThrow();
                Goal target = Goal.valueOf(player.path("goal").asText());
                Cell move = java.util.stream.StreamSupport.stream(board.path("legalMoves").spliterator(), false)
                        .map(p -> new Cell(p.path("x").asInt(), p.path("y").asInt()))
                        .min(Comparator.comparingInt(cell -> QuoridorBoard.distance(cell, target, List.of())))
                        .orElseThrow();
                engine.apply(new GameActionCommand(actor, game, "move-" + step, state.version(),
                        mapper.createObjectNode().put("kind", "move").put("x", move.x()).put("y", move.y())));
            }
        } else {
            for (int i = 0; i < count - 1; i++) {
                engine.forfeit(new GameForfeitCommand(members.get(i), game, "leave-" + i));
            }
        }
        GameFinished finish = recorded.stream(GameFinished.class).filter(e -> e.gameId().equals(game))
                .findFirst().orElseThrow();
        delivery.drain(100);
        long id = Long.parseLong(game);
        settlements.settle(id);
        long ledgerCount = jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?",
                Long.class, id);
        events.publishEvent(finish);
        delivery.drain(100);
        settlements.settle(id);

        assertThat(ledgerCount).isEqualTo(2L * count);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?",
                Long.class, id)).isEqualTo(ledgerCount);
        long totalBalance = 0;
        for (var participant : finish.participants()) {
            long user = participant.userId();
            long delta = participant.result() == GameFinished.Result.WIN ? bet * (count - 1) : -bet;
            var wallet = wallets.findByUserId(user).orElseThrow();
            assertThat(wallet.balance()).isEqualTo(100 + delta);
            assertThat(wallet.reserved()).isZero();
            var result = results.load(user, game).orElseThrow();
            assertThat(result.settlementStatus()).isEqualTo(GameResultView.SettlementStatus.SETTLED);
            assertThat(result.myCoinDelta()).isEqualTo(delta);
            assertThat(jdbc.queryForObject("SELECT SUM(balance_delta) FROM wallet_transactions "
                    + "WHERE game_session_id=? AND wallet_id=?", Long.class, id, wallet.id())).isEqualTo(delta);
            assertThat(jdbc.queryForObject("SELECT SUM(reserved_delta) FROM wallet_transactions "
                    + "WHERE game_session_id=? AND wallet_id=?", Long.class, id, wallet.id())).isZero();
            totalBalance += wallet.balance();
        }
        assertThat(totalBalance).isEqualTo(100L * count);
        assertThat(jdbc.queryForObject("SELECT active_table_id FROM game_sessions WHERE id=?", String.class, id))
                .isNull();
        assertThat(starts.find(command).code()).isEqualTo("GAME_ALREADY_TERMINATED");
    }
}
