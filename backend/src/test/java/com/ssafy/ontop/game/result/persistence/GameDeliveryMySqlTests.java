package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.JpaGameStartGateway;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@Tag("mysql")
@SpringBootTest(properties = {
        "spring.profiles.active=local,db", "ontop.game-start.enabled=true", "ontop.games.omok.enabled=true",
        "ontop.shop.enabled=true", "ontop.minigames.enabled=true", "ontop.game-recovery.background-enabled=false",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame"
})
class GameDeliveryMySqlTests {
    @Autowired private JpaGameStartGateway starts;
    @Autowired private GameFinishPersistenceService finishes;
    @Autowired private GameSettlementPersistenceService settlements;
    @Autowired private GameEventDelivery delivery;
    @Autowired private GameTerminalRetryService retries;
    @Autowired private GameResultOutbox outbox;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private DataSource source;
    @Autowired private Flyway flyway;
    @Autowired private GameStoredRoundQuery storedRounds;
    @Autowired private GameFinishedPersistenceListener finishListener;
    @Autowired private GameParticipantLeftPersistenceService departures;
    @Autowired private com.ssafy.ontop.game.start.GameRuntimeIdentity identity;

    @DynamicPropertySource static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_story174_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("이벤트 검증은 승인된 Story 174 격리 DB에서만 실행합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @Test void V123_적용과_재실행_및_이탈수신_제약을_검증한다() {
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion()).contains("123");
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        var game = reserve();
        assertThatThrownBy(() -> jdbc.update("UPDATE game_participants SET departure_payload_hash=? "
                + "WHERE game_session_id=?", new byte[32], game.id())).isInstanceOf(RuntimeException.class);
    }

    @Test void 최초수신_DB실패는_미ACK로_보존한뒤_판정과원장을_한번만_저장한다() {
        var game = reserve();
        String trigger = failGameUpdate(game);
        var ack = delivery.submit(finish(game)).toCompletableFuture();
        try {
            assertThat(delivery.drain(100)).isZero();
            assertThat(ack.isDone()).isFalse();
            assertThat(state(game)).isEqualTo("RESERVED/PENDING");
            assertThat(outboxCount(game)).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER `" + trigger + "`");
        }
        await().atMost(Duration.ofSeconds(4)).untilAsserted(() -> {
            delivery.drain(100);
            assertThat(ack.isDone()).isTrue();
        });
        assertThat(ack.isCompletedExceptionally()).isFalse();
        assertThat(state(game)).isEqualTo("FINISHED/SETTLED");
        assertThat(outboxCount(game)).isEqualTo(2);
        long count = ledgerCount(game);
        delivery.submit(finish(game));
        delivery.drain(100);
        assertThat(ledgerCount(game)).isEqualTo(count);
        assertThat(outboxCount(game)).isEqualTo(2);
    }

    @Test void 종료뒤_늦게도착한_이탈은_보존하고_다른버전의_중복은_거절한다() {
        var game = reserve();
        var at = game.at();
        var event = new GameFinished(game.id() + ":finished", Long.toString(game.id()), game.table(), "OMOK", 9,
                List.of(new GameFinished.Participant(game.first(), GameFinished.Result.WIN, null, null),
                        new GameFinished.Participant(game.second(), GameFinished.Result.FORFEIT,
                                GameDepartureReason.LOGOUT, at)), "LOGOUT", at);
        var left = new GameParticipantLeft(game.id() + ":left:" + game.second(), Long.toString(game.id()),
                game.table(), "OMOK", 8, game.second(), GameDepartureReason.LOGOUT, at);
        delivery.submit(event);
        delivery.submit(left);
        assertThat(delivery.drain(100)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT departure_event_version FROM game_participants "
                + "WHERE game_session_id=? AND user_id=?", Long.class, game.id(), game.second())).isEqualTo(8);
        var changed = new GameParticipantLeft(left.eventId(), left.gameId(), left.tableId(), "OMOK", 7,
                left.userId(), left.leaveReason(), left.leftAt());
        var rejected = delivery.submit(changed).toCompletableFuture();
        delivery.drain(100);
        assertThat(rejected.isCompletedExceptionally()).isTrue();
        assertThat(ledgerCount(game)).isEqualTo(4);
    }

    @Test void outbox저장실패는_정산과_지갑을_롤백하고_예약과판정을_유지한다() {
        var game = reserve();
        finishes.accept(finish(game));
        String name = "game174_fail_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE TRIGGER `" + name + "` BEFORE INSERT ON game_result_outbox FOR EACH ROW BEGIN "
                + "IF NEW.game_session_id=" + game.id() + " AND NEW.result_version=2 THEN "
                + "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture outbox rollback'; END IF; END");
        try {
            assertThatThrownBy(() -> settlements.settle(game.id())).isInstanceOf(RuntimeException.class);
        } finally {
            jdbc.execute("DROP TRIGGER `" + name + "`");
        }
        assertThat(state(game)).isEqualTo("FINISHED/PENDING");
        assertThat(wallets.findByUserId(game.first()).orElseThrow().balance()).isEqualTo(100);
        assertThat(wallets.findByUserId(game.first()).orElseThrow().reserved()).isEqualTo(5);
        assertThat(ledgerCount(game)).isEqualTo(2);
        assertThat(outboxCount(game)).isEqualTo(1);
        retries.retryPending(game.id() - 1, 100);
        assertThat(state(game)).isEqualTo("FINISHED/SETTLED");
        assertThat(outboxCount(game)).isEqualTo(2);
    }

    @Test void 새_전달기에서_알림실패와_재전달을_복구해도_정산을_반복하지않는다() {
        var game = settled();
        long ledger = ledgerCount(game);
        var collector = new Collector(game.id());
        collector.fail = true;
        fresh(Instant.now(), collector).run(context -> context.getBean(GameResultNotifications.class).dispatchOnce(100));
        assertThat(deliveredCount(game)).isZero();
        assertThat(collector.users).contains(game.first(), game.second());
        collector.fail = false;
        // 이전 컨텍스트의 전달기/메모리 상태를 폐기하고 DB 스냅샷만으로 다시 전달한다.
        fresh(Instant.now().plusSeconds(60), collector).run(context -> {
            assertThat(context.getBean(GameResultNotifications.class).dispatchOnce(100)).isGreaterThanOrEqualTo(2);
        });
        assertThat(deliveredCount(game)).isEqualTo(2);
        assertThat(ledgerCount(game)).isEqualTo(ledger);
        assertThat(outboxCount(game)).isEqualTo(2);
        assertThat(wallets.findByUserId(game.first()).orElseThrow().balance()).isEqualTo(105);
    }

    @Test void 전달중_종료된_작업자의_lease는_새_컨텍스트에서_복구한다() {
        var game = settled();
        long id = jdbc.queryForObject("SELECT id FROM game_result_outbox WHERE game_session_id=? AND result_version=2",
                Long.class, game.id());
        var old = outbox.claim(id).orElseThrow();
        var collector = new Collector(game.id());
        fresh(Instant.now().plusSeconds(60), collector).run(context -> {
            context.getBean(GameResultNotifications.class).dispatchOnce(100);
        });
        assertThat(deliveredCount(game)).isEqualTo(2);
        assertThatThrownBy(() -> outbox.delivered(old))
                .isInstanceOf(org.springframework.dao.InvalidDataAccessApiUsageException.class)
                .hasMessage("결과 알림 전달 소유권이 변경되었습니다.");
        assertThat(ledgerCount(game)).isEqualTo(4);
    }

    @Test void 동일_outbox_동시선점은_한작업자만_성공한다() throws Exception {
        var game = settled();
        long id = jdbc.queryForObject("SELECT id FROM game_result_outbox WHERE game_session_id=? AND result_version=2",
                Long.class, game.id());
        try (var workers = Executors.newFixedThreadPool(8)) {
            var tasks = IntStream.range(0, 8).mapToObj(i -> workers.submit(() -> outbox.claim(id))).toList();
            int success = 0;
            for (var task : tasks) {
                if (task.get(10, TimeUnit.SECONDS).isPresent()) { success++; }
            }
            assertThat(success).isEqualTo(1);
        }
        assertThat(ledgerCount(game)).isEqualTo(4);
    }

    @Test void 자동종결재시도와_outbox_작업자가_확정된_PENDING을_처리한다() {
        var game = reserve();
        finishes.accept(finish(game));
        var collector = new Collector(game.id());
        fresh(Instant.now().plusSeconds(60), collector)
                .withUserConfiguration(GameTerminalRetryConfiguration.class)
                .withBean(GameTerminalRetryService.class, () -> retries)
                .withBean(GameTableRecovery.class, () -> org.mockito.Mockito.mock(GameTableRecovery.class))
                .run(context -> await().atMost(Duration.ofSeconds(12)).untilAsserted(() -> {
                    assertThat(state(game)).isEqualTo("FINISHED/SETTLED");
                    assertThat(deliveredCount(game)).isEqualTo(2);
                }));
        assertThat(ledgerCount(game)).isEqualTo(4);
    }

    @Test void 실제_비동기수신_작업자가_커밋뒤_ACK하고_정산한다() throws Exception {
        var game = reserve();
        var worker = new GameEventDelivery(finishListener, departures, Clock.systemUTC(), true);
        try {
            worker.start();
            var ack = worker.submit(finish(game)).toCompletableFuture();
            assertThat(ack.get(5, TimeUnit.SECONDS).eventId()).isEqualTo(game.id() + ":finished");
            assertThat(state(game)).isIn("FINISHED/PENDING", "FINISHED/SETTLED");
            await().atMost(Duration.ofSeconds(4)).untilAsserted(() -> {
                assertThat(state(game)).isEqualTo("FINISHED/SETTLED");
            });
            assertThat(ledgerCount(game)).isEqualTo(4);
        } finally {
            worker.stop();
        }
    }

    @Test void Hub복구는_현재_boot의_종결스냅샷만_읽고_다른boot를_변경하지않는다() {
        var game = settled();
        // 이 합성 경기의 outbox만 제거하여 V123 도입 전 종결 행을 재현한다. 재화·원장은 보존한다.
        jdbc.update("DELETE FROM game_result_outbox WHERE game_session_id=?", game.id());
        assertThat(storedRounds.currentRound(game.id(), identity)).isPresent();
        var other = new com.ssafy.ontop.game.start.GameRuntimeIdentity(identity.instanceId());
        assertThat(storedRounds.currentRound(game.id(), other)).isEmpty();
        assertThat(state(game)).isEqualTo("FINISHED/SETTLED");
        assertThat(ledgerCount(game)).isEqualTo(4);
    }

    @Test void 별도_JVM을_시작해_DB에_남은_outbox를_전달하고_지갑은_변경하지않는다() throws Exception {
        var game = settled();
        long ledger = ledgerCount(game);
        String classpath = System.getProperty("ontop.test.runtime-classpath");
        assertThat(classpath).isNotBlank();
        var arguments = java.nio.file.Files.createTempFile("game174-outbox-", ".args");
        var output = java.nio.file.Files.createTempFile("game174-outbox-", ".log");
        Process child = null;
        try {
            String cp = classpath.replace("\\", "\\\\").replace("\"", "\\\"");
            java.nio.file.Files.writeString(arguments, "--class-path\n\"" + cp + "\"\n");
            var javaExecutable = java.nio.file.Path.of(System.getProperty("java.home"), "bin", "java.exe");
            child = new ProcessBuilder(javaExecutable.toString(), "@" + arguments, GameOutboxRestartProbe.class.getName(),
                    Long.toString(game.id())).redirectErrorStream(true).redirectOutput(output.toFile()).start();
            assertThat(child.waitFor(30, TimeUnit.SECONDS)).isTrue();
            assertThat(child.exitValue()).isZero();
            assertThat(java.nio.file.Files.readString(output)).contains("OUTBOX_RESTART_DELIVERED=2");
            assertThat(deliveredCount(game)).isEqualTo(2);
            assertThat(ledgerCount(game)).isEqualTo(ledger);
            assertThat(wallets.findByUserId(game.first()).orElseThrow().balance()).isEqualTo(105);
        } finally {
            if (child != null && child.isAlive()) { child.destroyForcibly().waitFor(5, TimeUnit.SECONDS); }
            java.nio.file.Files.deleteIfExists(arguments);
            java.nio.file.Files.deleteIfExists(output);
        }
    }

    private ApplicationContextRunner fresh(Instant now, Collector collector) {
        return new ApplicationContextRunner().withUserConfiguration(DeliveryConfiguration.class)
                .withPropertyValues("spring.profiles.active=db", "ontop.game-start.enabled=true")
                // 전달기만 재생성한다. 자식 컨텍스트 종료가 부모의 공유 풀을 닫으면 안 된다.
                .withBean(DataSource.class, () -> source, definition -> definition.setDestroyMethodName(""))
                .withBean(ObjectMapper.class, () -> mapper)
                .withBean("oauthClock", Clock.class, () -> Clock.fixed(now, ZoneOffset.UTC))
                .withBean(Collector.class, () -> collector);
    }

    @EnableTransactionManagement
    static class DeliveryConfiguration {
        @Bean DataSourceTransactionManager transactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }
        @Bean JdbcTemplate jdbcTemplate(DataSource source) { return new JdbcTemplate(source); }
        @Bean GameResultOutbox outbox(JdbcTemplate jdbc, ObjectMapper mapper, Clock clock) {
            return new GameResultOutbox(jdbc, mapper, clock);
        }
        @Bean GameResultNotifications notifications(GameResultOutbox outbox,
                org.springframework.context.ApplicationEventPublisher publisher) {
            return new GameResultNotifications(outbox, publisher);
        }
    }

    static class Collector {
        private final long game;
        private volatile boolean fail;
        private final List<Long> users = new CopyOnWriteArrayList<>();
        Collector(long game) { this.game = game; }
        @EventListener public void result(GameResultCommitted event) {
            if (event.result().gameSessionId().equals(Long.toString(game))) {
                users.add(event.result().userId());
                if (fail) { throw new IllegalStateException("fixture delivery"); }
            }
        }
    }

    private Fixture settled() {
        var game = reserve();
        finishes.accept(finish(game));
        settlements.settle(game.id());
        return game;
    }

    private Fixture reserve() {
        long first = member();
        long second = member();
        String table = "delivery-" + UUID.randomUUID();
        var command = new GameStartCommand(UUID.randomUUID(), table, 1, "OMOK", List.of(
                new GameStartCommand.Participant(Long.toString(first), 1),
                new GameStartCommand.Participant(Long.toString(second), 2)), null, 5);
        var result = starts.startGame(command);
        assertThat(result.isReservationCommitted(command)).isTrue();
        return new Fixture(Long.parseLong(result.gameSessionId()), table, first, second, Instant.now());
    }

    private long member() {
        String unique = UUID.randomUUID().toString();
        var user = users.saveAndFlush(new User(LoginProvider.NAVER, "delivery-" + unique,
                unique.replace("-", "").substring(0, 8), CharacterGender.MALE));
        wallets.saveAndFlush(Wallet.forSignup(user.getId(), Instant.now()));
        return user.getId();
    }

    private GameFinished finish(Fixture game) {
        return new GameFinished(game.id() + ":finished", Long.toString(game.id()), game.table(), "OMOK", 9,
                List.of(new GameFinished.Participant(game.first(), GameFinished.Result.WIN, null, null),
                        new GameFinished.Participant(game.second(), GameFinished.Result.LOSE, null, null)),
                "FIVE_IN_ROW", game.at());
    }

    private String failGameUpdate(Fixture game) {
        String name = "game174_fail_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE TRIGGER `" + name + "` BEFORE UPDATE ON game_sessions FOR EACH ROW BEGIN "
                + "IF NEW.id=" + game.id() + " AND NEW.status='FINISHED' THEN "
                + "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture accept rollback'; END IF; END");
        return name;
    }

    private String state(Fixture game) {
        return jdbc.queryForObject("SELECT CONCAT(status,'/',settlement_status) FROM game_sessions WHERE id=?",
                String.class, game.id());
    }
    private long outboxCount(Fixture game) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM game_result_outbox WHERE game_session_id=?", Long.class, game.id());
    }
    private long deliveredCount(Fixture game) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM game_result_outbox WHERE game_session_id=? AND delivered_at IS NOT NULL",
                Long.class, game.id());
    }
    private long ledgerCount(Fixture game) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE game_session_id=?", Long.class, game.id());
    }
    private record Fixture(long id, String table, long first, long second, Instant at) { }
}
