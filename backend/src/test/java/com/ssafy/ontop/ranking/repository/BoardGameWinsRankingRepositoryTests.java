package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.ranking.repository.BoardGameWinsRankingRepository.WinStanding;
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
@Import(BoardGameWinsRankingRepository.class)
class BoardGameWinsRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BoardGameWinsRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_WINS_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_wins_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("승수 랭킹은 새로 만든 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_WINS_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_WINS_DB_PASSWORD"));
    }

    @Test
    void 여러_게임의_승수를_합산하고_같은_승수는_먼저_도달한_순서로_표시한다() {
        long earlier = member("먼저도달");
        long later = member("나중도달");
        long third = member("한승");
        game(earlier, "OMOK", "WIN", STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        long reachedGame = game(earlier, "ONE_CARD", "WIN", STARTED_AT.plusSeconds(3),
                "FINISHED", "SETTLED");
        game(later, "LIAR_BRIDGE", "WIN", STARTED_AT.plusSeconds(2), "FINISHED", "SETTLED");
        game(later, "DICE_LEDGER", "WIN", STARTED_AT.plusSeconds(4), "FINISHED", "SETTLED");
        game(third, "OMOK", "WIN", STARTED_AT.plusSeconds(5), "FINISHED", "SETTLED");

        List<WinStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(WinStanding::userId).containsExactly(earlier, later, third);
        assertThat(standings).extracting(WinStanding::winCount).containsExactly(2L, 2L, 1L);
        assertThat(standings).extracting(WinStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings.get(0).reachedAt()).isEqualTo(STARTED_AT.plusSeconds(3));
        assertThat(standings.get(0).gameSessionId()).isEqualTo(reachedGame);
    }

    @Test
    void 시작전_미정산_무효_무승부_패배_기권_탈퇴회원은_집계하지_않는다() {
        long included = member("경계포함");
        game(included, "OMOK", "WIN", STARTED_AT, "FINISHED", "SETTLED");
        game(member("시작전"), "OMOK", "WIN", STARTED_AT.minusMillis(1), "FINISHED", "SETTLED");
        game(member("미정산"), "OMOK", "WIN", null, "FINISHED", "PENDING");
        game(member("무효"), "OMOK", "WIN", STARTED_AT.plusSeconds(1), "INVALID", "SETTLED");
        game(member("무승부"), "OMOK", "DRAW", STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        game(member("패배"), "OMOK", "LOSE", STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        game(member("기권"), "OMOK", "FORFEIT", STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        long deleted = member("탈퇴");
        game(deleted, "OMOK", "WIN", STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", deleted);

        assertThat(rankings.findTopTen(STARTED_AT)).extracting(WinStanding::userId).containsExactly(included);
    }

    @Test
    void 열번째_동점에서는_오래된_도달기록만_표시한다() {
        for (int index = 0; index < 9; index++) {
            long user = member("상위" + index);
            game(user, "OMOK", "WIN", STARTED_AT.plusSeconds(index + 1), "FINISHED", "SETTLED");
            game(user, "ONE_CARD", "WIN", STARTED_AT.plusSeconds(index + 11), "FINISHED", "SETTLED");
        }
        long newer = member("최근동점");
        long older = member("오래동점");
        game(newer, "OMOK", "WIN", STARTED_AT.plusSeconds(40), "FINISHED", "SETTLED");
        game(older, "OMOK", "WIN", STARTED_AT.plusSeconds(30), "FINISHED", "SETTLED");

        List<WinStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).hasSize(10);
        assertThat(standings.get(9).userId()).isEqualTo(older);
        assertThat(standings.get(9).rank()).isEqualTo(10);
        assertThat(standings).extracting(WinStanding::userId).doesNotContain(newer);
    }

    @Test
    void 승수와_도달시각이_같으면_경기번호를_회원번호보다_먼저_비교한다() {
        long lowerUserId = member("먼저회원");
        long higherUserId = member("나중회원");
        Instant at = STARTED_AT.plusSeconds(10);
        long earlierGame = game(higherUserId, "OMOK", "WIN", at, "FINISHED", "SETTLED");
        long laterGame = game(lowerUserId, "OMOK", "WIN", at, "FINISHED", "SETTLED");

        assertThat(lowerUserId).isLessThan(higherUserId);
        assertThat(earlierGame).isLessThan(laterGame);
        assertThat(rankings.findTopTen(STARTED_AT)).extracting(WinStanding::userId)
                .containsExactly(higherUserId, lowerUserId);
    }

    @Test
    void 실제_실행계획과_집계시간을_기록한다() throws Exception {
        game(member("계획측정"), "OMOK", "WIN", STARTED_AT.plusSeconds(1), "FINISHED", "SETTLED");
        String plan = jdbc.queryForObject("EXPLAIN FORMAT=TREE "
                + BoardGameWinsRankingRepository.TOP_TEN_SQL.replace(":startedAtMillis", "?"),
                String.class, STARTED_AT.toEpochMilli());
        long started = System.nanoTime();
        List<WinStanding> standings = rankings.findTopTen(STARTED_AT);
        long elapsedNanos = System.nanoTime() - started;

        assertThat(plan).isNotBlank();
        assertThat(standings).hasSize(1);
        Path report = Path.of("build", "board-game-wins-ranking-plan.txt");
        Files.createDirectories(report.getParent());
        Files.writeString(report, "Elapsed: " + elapsedNanos / 1_000_000.0 + " ms\n\n" + plan + "\n");
    }

    private long member(String nickname) {
        String providerUserId = "wins-ranking-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id=?", Long.class, providerUserId);
    }

    private long game(long userId, String gameCode, String result, Instant settledAt,
                      String status, String settlementStatus) {
        String tableId = "wins-ranking-" + UUID.randomUUID();
        Long settledMillis = settledAt == null ? null : settledAt.toEpochMilli();
        // 집계 필터만 검증하는 최소 행이다. 정산 흐름 자체는 기존 통합 테스트가 담당한다.
        jdbc.update("""
                INSERT INTO game_sessions (start_attempt_id, request_fingerprint, table_id, table_version,
                    game_code, participant_count, bet_amount_per_player, total_pot, status, settlement_status,
                    owner_instance_id, owner_boot_id, created_at, reserved_at, settled_at)
                VALUES (UUID_TO_BIN(UUID()), UNHEX(SHA2(UUID(), 256)), ?, 0,
                    ?, 2, 1, 2, ?, ?, 'ranking-test', UUID_TO_BIN(UUID()),
                    CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), FROM_UNIXTIME(? / 1000))
                """, tableId, gameCode, status, settlementStatus, settledMillis);
        long gameId = jdbc.queryForObject("SELECT id FROM game_sessions WHERE table_id=?", Long.class, tableId);
        jdbc.update("""
                INSERT INTO game_participants (game_session_id, user_id, seat_number, participant_order,
                    participant_status, result, reserved_amount, coin_delta, reservation_released_at)
                VALUES (?, ?, 1, 0, 'FINISHED', ?, 1, 1, FROM_UNIXTIME(? / 1000))
                """, gameId, userId, result, settledMillis);
        return gameId;
    }
}
