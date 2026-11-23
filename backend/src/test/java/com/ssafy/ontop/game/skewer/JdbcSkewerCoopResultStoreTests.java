package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.skewer.coop.repository.JdbcSkewerCoopResultStore;
import com.ssafy.ontop.game.skewer.coop.repository.SkewerCoopResultJournal;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 실행은 사용자 최종 검수 단계에서 loopback의 별도 MySQL 8.4 DB에 한정한다. */
@Tag("mysql")
@ActiveProfiles({"local", "db"})
// V165가 db/shop의 items를 참조한다.
@DataJpaTest(properties = {"spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.games.skewer-coop.enabled=true"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JdbcSkewerCoopResultStore.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class JdbcSkewerCoopResultStoreTests {
    private static final Instant NOW = Instant.parse("2026-11-02T12:00:00Z");
    private final List<Long> users = new ArrayList<>();
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JdbcSkewerCoopResultStore store;
    @TempDir Path temporary;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SKEWER_COOP_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_skewer_coop_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("꼬치왕 정산은 loopback의 새 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SKEWER_COOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SKEWER_COOP_DB_PASSWORD"));
    }

    @AfterEach
    void 생성한_테스트_회원의_데이터만_정리한다() {
        for (long user : users) {
            jdbc.update("""
                    DELETE p FROM skewer_coop_rewards p JOIN skewer_coop_results r ON r.game_id = p.game_id
                    WHERE r.team_low_id = ? OR r.team_high_id = ?
                    """, user, user);
            jdbc.update("DELETE FROM skewer_coop_results WHERE team_low_id = ? OR team_high_id = ?", user, user);
            jdbc.update("DELETE t FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id WHERE w.user_id = ?",
                    user);
            jdbc.update("DELETE FROM wallets WHERE user_id = ?", user);
            jdbc.update("DELETE FROM users WHERE id = ?", user);
        }
    }

    @Test
    void 일일누계와_무관하게_각자_전액_지급하고_중복결과는_다시_지급하지_않는다() {
        long chef = member("요리사", true), server = member("서빙", true);
        reward(chef, 990);
        reward(server, 30);
        var event = event(chef, server, 2400, true, "SKEWER_TIME_UP");

        store.settle(event, NOW);
        store.settle(event, NOW.plusSeconds(2));

        var first = store.find(chef, event.result().gameId(), NOW).orElseThrow();
        var second = store.find(server, event.result().gameId(), NOW).orElseThrow();
        assertThat(first.coinsCalculated()).isEqualTo(120);
        assertThat(first.coinsGranted()).isEqualTo(120);
        assertThat(first.todayEarned()).isEqualTo(1110);
        assertThat(first.balance()).isEqualTo(1210);
        assertThat(second.coinsGranted()).isEqualTo(120);
        assertThat(second.todayEarned()).isEqualTo(150);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='SKEWER_REWARD'",
                Integer.class)).isEqualTo(2);
        assertThat(store.find(999999, event.result().gameId(), NOW)).isEmpty();
        var tomorrow = store.find(chef, event.result().gameId(), NOW.plusSeconds(86_400)).orElseThrow();
        assertThat(tomorrow.coinsGranted()).isEqualTo(120);
        assertThat(tomorrow.remainingToday()).isNull();
    }

    @Test
    void 소수점은_버리고_영냥_보상도_영수증만_확정한다() {
        long chef = member("요리사", true), server = member("서빙", true);
        var event = event(chef, server, 19, false, "SKEWER_TIME_UP");

        store.settle(event, NOW);

        assertThat(store.find(chef, event.result().gameId(), NOW).orElseThrow().coinsGranted()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='SKEWER_REWARD'",
                Integer.class)).isZero();
    }

    @Test
    void 같은_두명의_역할을_바꿔도_최고기록_하나만_등록하고_비VR와_기권은_제외한다() {
        long chef = member("요리사", true), server = member("서빙", true);
        store.settle(event(chef, server, 1000, true, "SKEWER_TIME_UP"), NOW);
        store.settle(event(server, chef, 2000, true, "SKEWER_TIME_UP"), NOW);
        store.settle(event(chef, server, 9000, false, "SKEWER_TIME_UP"), NOW);
        store.settle(event(chef, server, 9000, true, "SKEWER_FORFEIT"), NOW);

        var ranking = store.ranking(chef, NOW);

        assertThat(ranking.items()).hasSize(1);
        assertThat(ranking.items().getFirst().teamScore()).isEqualTo(2000);
        assertThat(ranking.myBest()).isEqualTo(ranking.items().getFirst());
    }

    @Test
    void PC와_VR의_같은_팀_기록을_독립적으로_집계하고_각각_중복지급하지_않는다() {
        long chef = member("분리요리사", true), server = member("분리서빙", true);
        var legacy = event(chef, server, 1000, true, "SKEWER_TIME_UP");
        var source = event(chef, server, 2000, true, "SKEWER_TIME_UP");
        var pc = new SkewerCoopFinished(source.result(), source.teamScore(), source.served(),
                chef, server, true, 240000, 240000, "PC");
        store.settle(legacy, NOW);
        store.settle(pc, NOW);
        store.settle(pc, NOW);

        assertThat(store.ranking(chef, NOW, "PC").playMode()).isEqualTo("PC");
        assertThat(store.ranking(chef, NOW, "PC").items()).singleElement()
                .satisfies(item -> assertThat(item.teamScore()).isEqualTo(2000));
        assertThat(store.ranking(chef, NOW, "VR").items()).singleElement()
                .satisfies(item -> assertThat(item.teamScore()).isEqualTo(1000));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skewer_coop_rewards", Integer.class)).isEqualTo(4);
    }

    @Test
    void 한쪽_지갑이_없으면_공동결과와_두사람의_지급을_모두_롤백한다() {
        long chef = member("요리사", true), server = member("서빙", false);
        var event = event(chef, server, 2400, true, "SKEWER_TIME_UP");

        assertThatThrownBy(() -> store.settle(event, NOW)).isInstanceOf(DataIntegrityViolationException.class);

        assertThat(store.find(chef, event.result().gameId(), NOW)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, chef)).isEqualTo(100);
    }

    @Test
    void DB저장_전_JVM이_강제종료되어도_복구하고_커밋후_재전달은_중복지급하지_않는다() throws Exception {
        long chef = member("복구요리", true), server = member("복구서빙", true);
        var event = event(chef, server, 2407, false, "SKEWER_TIME_UP");
        var mapper = new ObjectMapper().findAndRegisterModules();
        Path payload = temporary.resolve("input.json"), journalPath = temporary.resolve("journal");
        mapper.writeValue(payload.toFile(), event);
        String classpath = System.getProperty("ontop.test.runtime-classpath");
        assertThat(classpath).isNotBlank();
        Path arguments = temporary.resolve("java.args"), output = temporary.resolve("child.log");
        Files.writeString(arguments, "--class-path\n\""
                + classpath.replace("\\", "\\\\").replace("\"", "\\\"") + "\"\n");
        boolean windows = System.getProperty("os.name").startsWith("Windows");
        Path executable = Path.of(System.getProperty("java.home"), "bin", windows ? "java.exe" : "java");
        Process child = new ProcessBuilder(executable.toString(), "@" + arguments,
                SkewerCoopJournalCrashProbe.class.getName(), journalPath.toString(), payload.toString())
                .redirectErrorStream(true).redirectOutput(output.toFile()).start();
        try {
            assertThat(child.waitFor(30, TimeUnit.SECONDS)).isTrue();
            assertThat(child.exitValue()).withFailMessage(Files.readString(output)).isZero();
        } finally {
            if (child.isAlive()) {
                child.destroyForcibly().waitFor(5, TimeUnit.SECONDS);
            }
        }
        assertThat(store.find(chef, event.result().gameId(), NOW)).isEmpty();
        var restarted = new SkewerCoopSettlementService(store, Clock.fixed(NOW, ZoneOffset.UTC),
                new SkewerCoopResultJournal(journalPath, mapper));
        try {
            restarted.retry();
            assertThat(store.find(chef, event.result().gameId(), NOW).orElseThrow().coinsGranted()).isEqualTo(120);
            // DB 커밋 직후, 저널 삭제 전에 종료된 상황과 같은 미처리 파일을 재전달한다.
            restarted.finished(event);
            restarted.retry();
            assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, chef))
                    .isEqualTo(220);
            assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, server))
                    .isEqualTo(220);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM skewer_coop_rewards WHERE game_id = ?",
                    Integer.class, event.result().gameId())).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='SKEWER_REWARD'",
                    Integer.class)).isEqualTo(2);
        } finally {
            restarted.close();
        }
        try (var journal = new SkewerCoopResultJournal(journalPath, mapper)) {
            assertThat(journal.load()).isEmpty();
        }
    }

    private long member(String nickname, boolean wallet) {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        String provider = "skewer-test-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, provider, nickname);
        long user = jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, provider);
        users.add(user);
        if (wallet) {
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 0)", user);
        }
        return user;
    }

    private void reward(long user, int amount) {
        long wallet = jdbc.queryForObject("SELECT id FROM wallets WHERE user_id = ?", Long.class, user);
        jdbc.update("UPDATE wallets SET balance = balance + ? WHERE id = ?", amount, wallet);
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta, reserved_delta,
                    idempotency_key, created_at) VALUES (?, 'MINIGAME_REWARD', ?, 0, ?, ?)
                """, wallet, amount, "skewer-test:" + UUID.randomUUID(), NOW.minusSeconds(1).atOffset(ZoneOffset.UTC).toLocalDateTime());
    }

    private SkewerCoopFinished event(long chef, long server, int score, boolean vr, String reason) {
        String id = "skewer-coop-" + UUID.randomUUID();
        return new SkewerCoopFinished(new GameLifecycle().finished(id, "vr:" + id, "SKEWER_COOP", 10,
                List.of(chef, server), List.of(chef, server), reason, NOW), score, 3, chef, server, vr,
                240_000, 240_000);
    }
}
