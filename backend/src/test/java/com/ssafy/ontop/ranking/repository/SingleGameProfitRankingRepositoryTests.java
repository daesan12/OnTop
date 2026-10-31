package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.ranking.repository.SingleGameProfitRankingRepository.ProfitStanding;
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
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(SingleGameProfitRankingRepository.class)
class SingleGameProfitRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private SingleGameProfitRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_PROFIT_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_profit_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("단판 순이익 랭킹은 새로 만든 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_PROFIT_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_PROFIT_DB_PASSWORD"));
    }

    @Test
    void 회원별_최고_순이익을_한번만_뽑고_같은_값은_공동순위와_최초기록순으로_표시한다() {
        long first = member("최초기록");
        long second = member("다음기록");
        long third = member("낮은기록");
        game(first, 7, STARTED_AT.plusSeconds(5), "FINISHED", "SETTLED");
        long firstBest = game(first, 15, STARTED_AT.plusSeconds(30), "FINISHED", "SETTLED");
        game(first, 15, STARTED_AT.plusSeconds(40), "FINISHED", "SETTLED");
        game(second, 15, STARTED_AT.plusSeconds(20), "FINISHED", "SETTLED");
        game(third, 5, STARTED_AT.plusSeconds(50), "FINISHED", "SETTLED");

        List<ProfitStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(ProfitStanding::userId).containsExactly(second, first, third);
        assertThat(standings).extracting(ProfitStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings).extracting(ProfitStanding::profit).containsExactly(15L, 15L, 5L);
        assertThat(standings.get(1).gameSessionId()).isEqualTo(firstBest);
        assertThat(standings.get(1).settledAt()).isEqualTo(STARTED_AT.plusSeconds(30));
    }

    @Test
    void 시작전_미정산_무효_영이하_탈퇴회원은_집계하지_않는다() {
        long eligible = member("경계포함");
        long before = member("시작이전");
        long pending = member("정산전");
        long invalid = member("무효경기");
        long zero = member("영수익");
        long negative = member("음수익");
        long deleted = member("탈퇴회원");
        game(eligible, 1, STARTED_AT, "FINISHED", "SETTLED");
        game(before, 99, STARTED_AT.minusMillis(1), "FINISHED", "SETTLED");
        game(pending, 99, null, "FINISHED", "PENDING");
        game(invalid, 99, STARTED_AT.plusSeconds(1), "INVALID", "SETTLED");
        game(zero, 0, STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        game(negative, -1, STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        game(deleted, 99, STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", deleted);

        List<ProfitStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(ProfitStanding::userId).containsExactly(eligible);
    }

    @Test
    void 열번째_동점은_오래된_기록_한명만_표시한다() {
        for (int index = 0; index < 9; index++) {
            game(member("상위" + index), 100 - index, STARTED_AT.plusSeconds(index), "FINISHED", "SETTLED");
        }
        long newer = member("최근동점");
        long older = member("오래동점");
        game(newer, 1, STARTED_AT.plusSeconds(30), "FINISHED", "SETTLED");
        game(older, 1, STARTED_AT.plusSeconds(20), "FINISHED", "SETTLED");

        List<ProfitStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).hasSize(10);
        assertThat(standings.get(9).userId()).isEqualTo(older);
        assertThat(standings.get(9).rank()).isEqualTo(10);
        assertThat(standings).extracting(ProfitStanding::userId).doesNotContain(newer);
    }

    @Test
    void 값과_정산시각이_같으면_회원번호보다_경기번호를_먼저_비교한다() {
        long lowerUserId = member("먼저회원");
        long higherUserId = member("나중회원");
        Instant settledAt = STARTED_AT.plusSeconds(10);
        long earlierGameId = game(higherUserId, 5, settledAt, "FINISHED", "SETTLED");
        long laterGameId = game(lowerUserId, 5, settledAt, "FINISHED", "SETTLED");

        List<ProfitStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(lowerUserId).isLessThan(higherUserId);
        assertThat(earlierGameId).isLessThan(laterGameId);
        assertThat(standings).extracting(ProfitStanding::userId).containsExactly(higherUserId, lowerUserId);
        assertThat(standings).extracting(ProfitStanding::rank).containsExactly(1L, 1L);
    }

    @Test
    void 실제_실행계획과_집계시간을_기록한다() throws Exception {
        game(member("계획측정"), 3, STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        String plan = jdbc.queryForObject("EXPLAIN FORMAT=TREE "
                + SingleGameProfitRankingRepository.TOP_TEN_SQL.replace(":startedAtMillis", "?"),
                String.class, STARTED_AT.toEpochMilli());

        long started = System.nanoTime();
        List<ProfitStanding> standings = rankings.findTopTen(STARTED_AT);
        long elapsedNanos = System.nanoTime() - started;

        assertThat(plan).isNotBlank();
        assertThat(standings).hasSize(1);
        Path report = Path.of("build", "single-game-profit-ranking-plan.txt");
        Files.createDirectories(report.getParent());
        Files.writeString(report, "Elapsed: " + elapsedNanos / 1_000_000.0 + " ms\n\n" + plan + "\n");
    }

    private long member(String nickname) {
        String providerUserId = "profit-ranking-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id=?", Long.class, providerUserId);
    }

    private long game(long userId, long profit, Instant settledAt, String status, String settlementStatus) {
        String tableId = "profit-ranking-" + UUID.randomUUID();
        Long settledMillis = settledAt == null ? null : settledAt.toEpochMilli();
        // 랭킹 SQL의 상태 필터를 격리 검증하기 위한 최소 DB 행이다. 경기 정산 흐름은 별도 통합 테스트가 담당한다.
        jdbc.update("""
                INSERT INTO game_sessions (start_attempt_id, request_fingerprint, table_id, table_version,
                    game_code, participant_count, bet_amount_per_player, total_pot, status, settlement_status,
                    owner_instance_id, owner_boot_id, created_at, reserved_at, settled_at)
                VALUES (UUID_TO_BIN(UUID()), UNHEX(SHA2(UUID(), 256)), ?, 0,
                    'OMOK', 2, 100, 200, ?, ?, 'ranking-test', UUID_TO_BIN(UUID()),
                    CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), FROM_UNIXTIME(? / 1000))
                """, tableId, status, settlementStatus, settledMillis);
        long gameId = jdbc.queryForObject("SELECT id FROM game_sessions WHERE table_id=?", Long.class, tableId);
        jdbc.update("""
                INSERT INTO game_participants (game_session_id, user_id, seat_number, participant_order,
                    participant_status, result, reserved_amount, coin_delta, reservation_released_at)
                VALUES (?, ?, 1, 0, 'FINISHED', ?, 100, ?, FROM_UNIXTIME(? / 1000))
                """, gameId, userId, profit > 0 ? "WIN" : profit == 0 ? "DRAW" : "LOSE", profit, settledMillis);
        return gameId;
    }
}
