package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_MINIGAME_AWARD_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_minigame_award_test_[A-Za-z0-9_]+(?:\\?.*)?")
class MinigameAwardMySqlTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 2);
    private static final Instant START = Instant.parse("2026-11-02T00:00:00Z");
    private static final Instant END = Instant.parse("2026-11-08T15:00:00Z");
    private JdbcTemplate jdbc;
    private MinigameAwardRepository repository;
    private DataSourceTransactionManager transactions;
    private AdminAccessPolicy admins;

    @Test
    void 실제_게임_기록으로_경계_유효성_GM_동점_재시도_동시실행을_검증한다() throws Exception {
        String url = System.getenv("TEST_MINIGAME_AWARD_DB_URL");
        assertThat(url).matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_minigame_award_test_[A-Za-z0-9_]+(?:\\?.*)?");
        var datasource = new DriverManagerDataSource(url,
                System.getenv("TEST_MINIGAME_AWARD_DB_USERNAME"),
                System.getenv("TEST_MINIGAME_AWARD_DB_PASSWORD"));
        jdbc = new JdbcTemplate(datasource);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
                """, Long.class)).isZero();
        Flyway.configure().dataSource(datasource)
                .locations("classpath:db/migration", "classpath:db/minigame")
                .baselineOnMigrate(false).outOfOrder(false).load().migrate();
        repository = new MinigameAwardRepository(jdbc);
        transactions = new DataSourceTransactionManager(datasource);

        long gm = member("gm");
        long early = member("early");
        long later = member("later");
        long invalid = member("invalid");
        admins = new AdminAccessPolicy(new AdminAccessProperties(Set.of(gm), Set.of(), Set.of(gm)));

        String bestBungeo = bungeo(early, 300, 10, "2026-11-03T01:00:00Z", "COMPLETED", "VERIFIED", "v5", true);
        bungeo(early, 100, 2, "2026-11-03T00:00:00Z", "COMPLETED", "VERIFIED", "v5", true);
        bungeo(later, 300, 10, "2026-11-03T01:01:00Z", "COMPLETED", "VERIFIED", "v5", true);
        bungeo(gm, 9_999, 99, "2026-11-03T01:02:00Z", "COMPLETED", "VERIFIED", "v5", true);
        bungeo(later, 9_999, 99, START.minusMillis(1).toString(), "COMPLETED", "VERIFIED", "v5", true);
        bungeo(later, 9_999, 99, END.toString(), "COMPLETED", "VERIFIED", "v5", true);
        bungeo(invalid, 9_999, 99, "2026-11-03T01:03:00Z", "INVALID", "VERIFIED", "v5", true);
        bungeo(invalid, 9_999, 99, "2026-11-03T01:04:00Z", "COMPLETED", "REJECTED", "v5", true);
        bungeo(invalid, 9_999, 99, "2026-11-03T01:05:00Z", "COMPLETED", "VERIFIED", "v4", true);
        bungeo(invalid, 9_999, 99, "2026-11-03T01:06:00Z", "COMPLETED", "VERIFIED", "v5", false);

        String bestJump = jump(early, 80_000, "2026-11-03T02:00:00Z", "FINISH", "v3", false);
        jump(later, 80_000, "2026-11-03T02:01:00Z", "FINISH", "v3", false);
        jump(gm, 1_000, "2026-11-03T02:02:00Z", "FINISH", "v3", false);
        jump(later, 1_000, START.minusMillis(1).toString(), "FINISH", "v3", false);
        jump(later, 1_000, END.toString(), "FINISH", "v3", false);
        jump(invalid, 1_000, "2026-11-03T02:03:00Z", "FALL", "v3", false);
        jump(invalid, 1_000, "2026-11-03T02:04:00Z", "FINISH", "v2", false);
        jump(invalid, 1_000, "2026-11-03T02:05:00Z", "FINISH", "v3", true);

        var tooEarly = service("2026-11-08T15:04:59.999Z");
        assertThat(repository.round(MinigameAwardType.BUNGEOPPANG, WEEK, false)).isEmpty();
        assertThat(tooEarly.memberResult(MinigameAwardType.BUNGEOPPANG, WEEK, early).status())
                .isEqualTo("NOT_ANNOUNCED");
        assertThatThrownBy(() -> tooEarly.finalizeRound(MinigameAwardType.BUNGEOPPANG, WEEK, gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_RECORDS_OPEN"));

        var awards = service("2026-11-08T15:05:00Z");
        var bungeo = awards.finalizeRound(MinigameAwardType.BUNGEOPPANG, WEEK, gm);
        assertThat(bungeo.finalized()).isTrue();
        assertThat(bungeo.vacant()).isFalse();
        assertThat(bungeo.candidateCount()).isEqualTo(3);
        assertThat(bungeo.excludedGmCount()).isOne();
        assertThat(bungeo.winner().userId()).isEqualTo(early);
        assertThat(bungeo.winner().sourceRecordId()).isEqualTo(bestBungeo);
        assertThat(bungeo.winner().sourceValue()).isEqualTo(300);
        assertThat(bungeo.winner().sourceAchievedAt()).isEqualTo(Instant.parse("2026-11-03T01:00:00Z"));
        assertThat(awards.finalizeRound(MinigameAwardType.BUNGEOPPANG, WEEK, gm).winner())
                .isEqualTo(bungeo.winner());

        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var calls = List.of(
                    executor.submit(() -> { start.await(); return awards.finalizeRound(MinigameAwardType.JUMPMAP, WEEK, gm); }),
                    executor.submit(() -> { start.await(); return awards.finalizeRound(MinigameAwardType.JUMPMAP, WEEK, gm); }));
            start.countDown();
            var left = calls.get(0).get(20, TimeUnit.SECONDS);
            var right = calls.get(1).get(20, TimeUnit.SECONDS);
            assertThat(left.winner()).isEqualTo(right.winner());
            assertThat(left.winner().userId()).isEqualTo(early);
            assertThat(left.winner().sourceRecordId()).isEqualTo(bestJump);
            assertThat(left.winner().sourceValue()).isEqualTo(80_000);
        }
        awards.finalizeDueRounds();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_finalization_attempts a
                JOIN event_rounds e ON e.id = a.event_round_id
                WHERE e.event_type = 'JUMPMAP' AND a.outcome = 'SUCCEEDED'
                """, Integer.class)).isOne();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_winners w
                JOIN event_rounds e ON e.id = w.event_round_id
                WHERE e.event_type IN ('BUNGEOPPANG', 'JUMPMAP')
                """, Integer.class)).isEqualTo(2);

        bungeo(invalid, 99_999, 99, "2026-11-04T01:00:00Z", "COMPLETED", "VERIFIED", "v5", true);
        assertThat(awards.adminResult(MinigameAwardType.BUNGEOPPANG, WEEK, gm).winner())
                .isEqualTo(bungeo.winner());
        var announced = service("2026-11-09T00:00:00Z");
        assertThat(announced.memberResult(MinigameAwardType.BUNGEOPPANG, WEEK, early).status())
                .isEqualTo("SELECTED");
        assertThat(announced.memberResult(MinigameAwardType.BUNGEOPPANG, WEEK, later).status())
                .isEqualTo("NOT_SELECTED");
        assertThat(announced.memberResult(MinigameAwardType.BUNGEOPPANG, WEEK, later).prize())
                .isNull();

        // A later week is configured explicitly; the original 2026-11-02 winner stays untouched.
        LocalDate nextWeek = WEEK.plusWeeks(1);
        Instant nextStart = Instant.parse("2026-11-09T00:00:00Z");
        Instant nextEnd = Instant.parse("2026-11-15T15:00:00Z");
        Instant nextAnnouncement = Instant.parse("2026-11-16T00:00:00Z");
        var weeklyRepository = new WeeklyMinigameRepository(jdbc);
        var beforeStart = weekly(weeklyRepository, "2026-11-08T23:00:00Z");
        assertThat(beforeStart.games(nextWeek, gm)).isEmpty();
        assertThat(beforeStart.supportedGames(gm)).extracting(
                WeeklyMinigameAwardService.SupportedGame::gameCode)
                .containsExactly("BUNGEOPPANG", "JUMPMAP");
        var configuration = new WeeklyMinigameAwardService.Configuration(nextStart, nextEnd,
                nextAnnouncement, "붕어빵", "v5-120000ms", true, "수동 지급 기프티콘");
        assertThatThrownBy(() -> beforeStart.configure(nextWeek, "MG_UNKNOWN", configuration, gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_RANKING_UNSUPPORTED"));
        assertThat(beforeStart.configure(nextWeek, "BUNGEOPPANG", configuration, gm).prizeName())
                .isEqualTo("수동 지급 기프티콘");
        assertThat(beforeStart.games(nextWeek, gm)).hasSize(1);
        assertThatThrownBy(() -> beforeStart.configure(WEEK, "BUNGEOPPANG", configuration, gm))
                .isInstanceOf(MinigameAwardException.class);

        String firstWeeklyRecord = bungeo(early, 500, 12, "2026-11-09T01:00:00Z",
                "COMPLETED", "VERIFIED", "v5", true);
        bungeo(later, 500, 12, "2026-11-09T01:01:00Z", "COMPLETED", "VERIFIED", "v5", true);
        bungeo(gm, 9999, 99, "2026-11-09T01:02:00Z", "COMPLETED", "VERIFIED", "v5", true);
        bungeo(invalid, 9999, 99, nextStart.minusMillis(1).toString(),
                "COMPLETED", "VERIFIED", "v5", true);
        bungeo(invalid, 9999, 99, nextEnd.toString(), "COMPLETED", "VERIFIED", "v5", true);
        bungeo(invalid, 9999, 99, "2026-11-09T01:03:00Z", "COMPLETED", "REJECTED", "v5", true);
        var beforeClose = weekly(weeklyRepository, "2026-11-15T15:04:59.999Z");
        assertThat(beforeClose.memberResult(nextWeek, "BUNGEOPPANG", early).status())
                .isEqualTo("NOT_ANNOUNCED");
        var preview = beforeClose.ranking(nextWeek, "BUNGEOPPANG", gm);
        assertThat(preview.status()).isEqualTo("PROVISIONAL");
        assertThat(preview.candidateCount()).isEqualTo(3);
        assertThat(preview.excludedGmCount()).isOne();
        assertThat(preview.ranks()).hasSize(2);
        assertThat(preview.ranks().getFirst().userId()).isEqualTo(early);
        assertThat(preview.ranks().getFirst().sourceRecordId()).isEqualTo(firstWeeklyRecord);
        assertThatThrownBy(() -> beforeClose.finalizeRound(nextWeek, "BUNGEOPPANG",
                new WeeklyMinigameAwardService.FinalizeRequest(3, 1, firstWeeklyRecord), gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_RECORDS_OPEN"));
        assertThatThrownBy(() -> beforeClose.configure(nextWeek, "BUNGEOPPANG",
                new WeeklyMinigameAwardService.Configuration(nextStart, nextEnd,
                        nextAnnouncement, "붕어빵", "v5-120000ms", false, "수동 지급 기프티콘"), gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_CONFIG_LOCKED"));
        var afterClose = weekly(weeklyRepository, "2026-11-15T15:05:00Z");
        assertThat(afterClose.ranking(nextWeek, "BUNGEOPPANG", gm).status()).isEqualTo("READY");
        assertThatThrownBy(() -> afterClose.finalizeRound(nextWeek, "BUNGEOPPANG", null, gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_INVALID_PREVIEW"));
        assertThatThrownBy(() -> afterClose.finalizeRound(nextWeek, "BUNGEOPPANG",
                new WeeklyMinigameAwardService.FinalizeRequest(null, null, null), gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_INVALID_PREVIEW"));
        assertThatThrownBy(() -> afterClose.finalizeRound(nextWeek, "BUNGEOPPANG",
                new WeeklyMinigameAwardService.FinalizeRequest(3, 1, "stale"), gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_RANKING_CHANGED"));

        var weeklyStart = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var calls = List.of(
                    executor.submit(() -> { weeklyStart.await(); return afterClose.finalizeRound(nextWeek,
                            "BUNGEOPPANG", new WeeklyMinigameAwardService.FinalizeRequest(3, 1,
                                    firstWeeklyRecord), gm); }),
                    executor.submit(() -> { weeklyStart.await(); return afterClose.finalizeRound(nextWeek,
                            "BUNGEOPPANG", new WeeklyMinigameAwardService.FinalizeRequest(3, 1,
                                    firstWeeklyRecord), gm); }));
            weeklyStart.countDown();
            assertThat(calls.get(0).get(20, TimeUnit.SECONDS).winner().userId()).isEqualTo(early);
            assertThat(calls.get(1).get(20, TimeUnit.SECONDS).winner().userId()).isEqualTo(early);
        }
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_winners w JOIN event_rounds r ON r.id = w.event_round_id
                WHERE r.week_start_date = ? AND r.event_type = 'BUNGEOPPANG'
                """, Integer.class, java.sql.Date.valueOf(nextWeek))).isOne();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_winners w JOIN event_rounds r ON r.id = w.event_round_id
                WHERE r.week_start_date = ? AND r.event_type = 'BUNGEOPPANG'
                """, Integer.class, java.sql.Date.valueOf(WEEK))).isOne();
        bungeo(invalid, 99_999, 99, "2026-11-11T01:00:00Z",
                "COMPLETED", "VERIFIED", "v5", true);
        assertThat(afterClose.ranking(nextWeek, "BUNGEOPPANG", gm).winner().userId()).isEqualTo(early);
        assertThat(afterClose.finalizeRound(nextWeek, "BUNGEOPPANG",
                new WeeklyMinigameAwardService.FinalizeRequest(3, 1, firstWeeklyRecord), gm)
                .winner().userId()).isEqualTo(early);
        assertThat(weekly(weeklyRepository, "2026-11-16T00:00:00Z")
                .memberResult(nextWeek, "BUNGEOPPANG", early).status()).isEqualTo("SELECTED");
        assertThat(weekly(weeklyRepository, "2026-11-16T00:00:00Z")
                .memberResult(nextWeek, "BUNGEOPPANG", later).status()).isEqualTo("NOT_SELECTED");

        var jumpConfiguration = new WeeklyMinigameAwardService.Configuration(nextStart, nextEnd,
                nextAnnouncement, "점프맵", "v3-park180-jump-v1", true, "외부 기프티콘");
        weekly(weeklyRepository, "2026-11-10T00:00:00Z")
                .configure(nextWeek, "JUMPMAP", jumpConfiguration, gm);
        String firstWeeklyJump = jump(early, 70_000, "2026-11-10T01:00:00Z", "FINISH", "v3", false);
        jump(later, 70_000, "2026-11-10T01:01:00Z", "FINISH", "v3", false);
        jump(gm, 10_000, "2026-11-10T01:02:00Z", "FINISH", "v3", false);
        var jumpPreview = afterClose.ranking(nextWeek, "JUMPMAP", gm);
        assertThat(jumpPreview.ranks().getFirst().sourceRecordId()).isEqualTo(firstWeeklyJump);
        assertThat(jumpPreview.excludedGmCount()).isOne();
        assertThat(afterClose.finalizeRound(nextWeek, "JUMPMAP",
                new WeeklyMinigameAwardService.FinalizeRequest(3, 1, firstWeeklyJump), gm)
                .winner().userId()).isEqualTo(early);

        LocalDate emptyWeek = nextWeek.plusWeeks(1);
        var emptyConfiguration = new WeeklyMinigameAwardService.Configuration(
                Instant.parse("2026-11-16T00:00:00Z"), Instant.parse("2026-11-22T15:00:00Z"),
                Instant.parse("2026-11-23T00:00:00Z"), "점프맵", "v3-park180-jump-v1",
                true, "외부 기프티콘");
        beforeStart.configure(emptyWeek, "JUMPMAP", emptyConfiguration, gm);
        assertThatThrownBy(() -> weekly(weeklyRepository, "2026-11-22T15:05:00Z")
                .configure(emptyWeek, "BUNGEOPPANG",
                        new WeeklyMinigameAwardService.Configuration(emptyConfiguration.startsAt(),
                                emptyConfiguration.endsAt(), emptyConfiguration.announcesAt(),
                                "붕어빵", "v5-120000ms", true, "외부 기프티콘"), gm))
                .isInstanceOf(MinigameAwardException.class)
                .satisfies(error -> assertThat(((MinigameAwardException) error).code())
                        .isEqualTo("EVENT_CONFIG_CLOSED"));
        assertThat(weekly(weeklyRepository, "2026-11-22T15:05:00Z")
                .finalizeRound(emptyWeek, "JUMPMAP",
                        new WeeklyMinigameAwardService.FinalizeRequest(0, 0, null), gm)
                .winner()).isNull();
        assertThat(weekly(weeklyRepository, "2026-11-23T00:00:00Z")
                .memberResult(emptyWeek, "JUMPMAP", early).status()).isEqualTo("NOT_SELECTED");
    }

    private MinigameAwardService service(String now) {
        return new MinigameAwardService(repository, admins, transactions,
                Clock.fixed(Instant.parse(now), ZoneOffset.UTC), WEEK);
    }

    private WeeklyMinigameAwardService weekly(WeeklyMinigameRepository configurations, String now) {
        return new WeeklyMinigameAwardService(configurations, repository, admins, transactions,
                Clock.fixed(Instant.parse(now), ZoneOffset.UTC));
    }

    private long member(String name) {
        String nickname = name;
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('NAVER', ?, ?, 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                """, UUID.randomUUID().toString(), nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE nickname = ?", Long.class, nickname);
    }

    private String bungeo(long userId, long score, long combo, String completedAt,
            String status, String terminalReason, String version, boolean validJson) {
        Instant completed = Instant.parse(completedAt);
        Instant playStarts = completed.minusSeconds(240);
        Instant playEnds = playStarts.plusMillis(BungeoppangV5Spec.DURATION_MS);
        jdbc.update("""
                INSERT INTO minigame_sessions(user_id, minigame_type, status, score,
                    started_at, ended_at)
                VALUES (?, 'BUNGEOPPANG', ?, ?, ?, ?)
                """, userId, status, score, Timestamp.from(playStarts.minusSeconds(5)),
                Timestamp.from(completed));
        String id = jdbc.queryForObject("SELECT CAST(MAX(id) AS CHAR) FROM minigame_sessions", String.class);
        jdbc.update("""
                INSERT INTO bungeoppang_records(minigame_session_id, rules_version, heats,
                    is_first_game, result_json)
                VALUES (?, ?, '[]', TRUE, ?)
                """, Long.parseLong(id), version,
                validJson ? "{\"made\":1,\"failed\":0,\"maxCombo\":" + combo + "}" : "{invalid");
        jdbc.update("""
                INSERT INTO bungeoppang_v4_rounds(minigame_session_id, config_version,
                    config_json, issued_at, countdown_starts_at, play_starts_at,
                    play_ends_at, submit_deadline, expires_at, approved_prefix_hash,
                    checkpoint_json, terminal_reason, final_request_hash,
                    final_through_seq, final_prefix_hash, settled_at, reward_date)
                VALUES (?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, 0, ?, ?, ?)
                """, Long.parseLong(id), BungeoppangV5Spec.CONFIG_VERSION,
                Timestamp.from(playStarts.minusSeconds(5)), Timestamp.from(playStarts.minusSeconds(2)),
                Timestamp.from(playStarts), Timestamp.from(playEnds),
                Timestamp.from(playEnds.plusSeconds(30)), Timestamp.from(playEnds.plusSeconds(60)),
                "a".repeat(64), terminalReason, "b".repeat(64), "c".repeat(64),
                Timestamp.from(completed), java.sql.Date.valueOf(WEEK));
        return id;
    }

    private String jump(long userId, long finishMs, String endedAt,
            String reason, String rulesVersion, boolean suspicious) {
        String id = UUID.randomUUID().toString();
        Instant ended = Instant.parse(endedAt);
        jdbc.update("""
                INSERT INTO jump_runs(id, user_id, channel_id, status, end_reason,
                    rules_version, course_version, is_first_run, started_at, ended_at,
                    gates_passed, gate_times_ms, final_reached, finish_ms, suspicious,
                    suspicious_reasons)
                VALUES (?, ?, 'channel-1', 'ENDED', ?, ?, ?, TRUE, ?, ?,
                    7, '[]', TRUE, ?, ?, ?)
                """, id, userId, reason, rulesVersion, JumpCourse.COURSE_VERSION,
                Timestamp.from(ended.minusSeconds(100)), Timestamp.from(ended), finishMs,
                suspicious, suspicious ? "[\"TOO_FAST:1\"]" : null);
        return id;
    }
}
