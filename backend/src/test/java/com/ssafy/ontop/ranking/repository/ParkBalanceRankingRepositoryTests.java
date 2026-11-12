package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository.BalanceStanding;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
// V165가 db/shop의 items를 참조한다.
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/shop")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ParkBalanceRankingRepository.class)
class ParkBalanceRankingRepositoryTests {
    private static final Instant BASE = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ParkBalanceRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_SNAPSHOT_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_park_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("공원 보유량 랭킹은 새로 만든 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_SNAPSHOT_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_SNAPSHOT_DB_PASSWORD"));
    }

    @Test
    void 잔액만으로_공동순위를_계산하고_같은_잔액은_지갑변경시각순으로_표시한다() {
        long newer = member("최근변경");
        long older = member("오래된변경");
        long third = member("다음순위");
        wallet(newer, 100, 0, BASE.plusSeconds(3));
        wallet(older, 100, 0, BASE.plusSeconds(1));
        wallet(third, 50, 0, BASE.plusSeconds(2));

        List<BalanceStanding> standings = rankings.findTopTen();

        assertThat(standings).extracting(BalanceStanding::userId).containsExactly(older, newer, third);
        assertThat(standings).extracting(BalanceStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings).extracting(BalanceStanding::coinBalance).containsExactly(100L, 100L, 50L);
    }

    @Test
    void 예약만으로_지갑변경시각이_바뀌면_동점_표시순서도_바뀐다() {
        long first = member("처음첫째");
        long second = member("처음둘째");
        wallet(first, 100, 0, BASE.plusSeconds(1));
        wallet(second, 100, 0, BASE.plusSeconds(2));
        jdbc.update("UPDATE wallets SET reserved_balance=1, updated_at=FROM_UNIXTIME(? / 1000) WHERE user_id=?",
                BASE.plusSeconds(3).toEpochMilli(), first);

        List<BalanceStanding> standings = rankings.findTopTen();

        assertThat(standings).extracting(BalanceStanding::userId).containsExactly(second, first);
        assertThat(standings).extracting(BalanceStanding::rank).containsExactly(1L, 1L);
        assertThat(standings).extracting(BalanceStanding::coinBalance).containsExactly(100L, 100L);
    }

    @Test
    void 잔액과_변경시각까지_같으면_회원번호로_안정_정렬한다() {
        long first = member("먼저가입");
        long second = member("나중가입");
        wallet(second, 100, 0, BASE);
        wallet(first, 100, 0, BASE);

        List<BalanceStanding> standings = rankings.findTopTen();

        assertThat(first).isLessThan(second);
        assertThat(standings).extracting(BalanceStanding::userId).containsExactly(first, second);
        assertThat(standings).extracting(BalanceStanding::rank).containsExactly(1L, 1L);
    }

    @Test
    void 열번째_동점은_오래된_지갑만_남기고_탈퇴자와_지갑없는_회원은_제외한다() {
        for (int index = 0; index < 9; index++) {
            wallet(member("상위" + index), 100 - index, 0, BASE.plusSeconds(index));
        }
        long newer = member("최근열째");
        long older = member("오래열째");
        wallet(newer, 1, 0, BASE.plusSeconds(40));
        wallet(older, 1, 0, BASE.plusSeconds(30));
        long deleted = member("탈퇴");
        wallet(deleted, 999, 0, BASE);
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", deleted);
        member("지갑없음");

        List<BalanceStanding> standings = rankings.findTopTen();

        assertThat(standings).hasSize(10);
        assertThat(standings.get(9).userId()).isEqualTo(older);
        assertThat(standings.get(9).rank()).isEqualTo(10);
        assertThat(standings).extracting(BalanceStanding::userId).doesNotContain(newer, deleted);
    }

    @Test
    void 보유량_쿼리의_실행계획과_집계시간을_기록한다() throws Exception {
        wallet(member("계획측정"), 10, 0, BASE);
        String plan = jdbc.queryForObject("EXPLAIN FORMAT=TREE " + ParkBalanceRankingRepository.TOP_TEN_SQL,
                String.class);
        long started = System.nanoTime();
        List<BalanceStanding> standings = rankings.findTopTen();
        long elapsedNanos = System.nanoTime() - started;

        assertThat(plan).isNotBlank();
        assertThat(standings).hasSize(1);
        Path report = Path.of("build", "park-balance-ranking-plan.txt");
        Files.createDirectories(report.getParent());
        Files.writeString(report, "Elapsed: " + elapsedNanos / 1_000_000.0 + " ms\n\n" + plan + "\n");
    }

    private long member(String nickname) {
        String providerUserId = "park-ranking-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id=?", Long.class, providerUserId);
    }

    private void wallet(long userId, long balance, long reserved, Instant changedAt) {
        jdbc.update("""
                INSERT INTO wallets (user_id, balance, reserved_balance, updated_at)
                VALUES (?, ?, ?, FROM_UNIXTIME(? / 1000))
                """, userId, balance, reserved, changedAt.toEpochMilli());
    }
}
