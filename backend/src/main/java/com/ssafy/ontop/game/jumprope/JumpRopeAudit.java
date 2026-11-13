package com.ssafy.ontop.game.jumprope;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.LongPredicate;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 확정된 줄넘기 판의 점프 시각 원본과 매크로 판별 신호를 운영자 조회용으로 남긴다.
 * 판정·점수·보상·랭킹과 이용자 응답에는 관여하지 않으며, 저장에 실패해도 판 확정은 그대로다.
 *
 * <p>저장은 전용 스레드 하나에서 한다. 판 확정 트랜잭션이 잡고 있는 판 행을 외래 키가 기다리므로
 * 확정이 커밋된 뒤에 들어간다. 서버가 그 사이에 내려가면 그 판의 기록만 빠진다.
 */
public class JumpRopeAudit implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(JumpRopeAudit.class);
    public static final int LIMIT = 200;
    static final int DUPLICATE_GROUPS = 50;
    /** 점프가 몇 개 없는 기록은 누구에게서나 같을 수 있어 중복으로 보지 않는다. */
    static final int DUPLICATE_MIN_JUMPS = 20;

    @Schema(name = "JumpRopeMacroSuspect")
    public record Suspect(String userId, String nickname, boolean withdrawn, int flaggedRounds, int duplicateRounds,
            int steadyRounds, int auditedRounds, int outsideParkRounds, Integer bestScore, Integer lowestJitterUs,
            Instant firstFlaggedAt, Instant lastFlaggedAt) { }

    @Schema(name = "JumpRopeDuplicateLog")
    public record DuplicateLog(String inputHash, int rounds, int members, List<String> userIds, int score,
            Instant firstCompletedAt, Instant lastCompletedAt) { }

    @Schema(name = "JumpRopeMacroReport")
    public record Report(boolean enabled, int limit, List<Suspect> suspects, List<DuplicateLog> duplicateLogs,
            Instant generatedAt) {
        public static Report disabled(Instant at) {
            return new Report(false, LIMIT, List.of(), List.of(), at);
        }
    }

    private final JdbcTemplate jdbc;
    private final LongPredicate inPark;
    private final ExecutorService writer = Executors.newSingleThreadExecutor(
            Thread.ofPlatform().daemon(true).name("jump-rope-audit").factory());

    /** @param inPark 회원이 지금 공원 채널에 접속해 있는지. 확인할 수 없는 환경이면 null. */
    public JumpRopeAudit(JdbcTemplate jdbc, LongPredicate inPark) {
        this.jdbc = jdbc;
        this.inPark = inPark;
    }

    /** 판 확정 직후 요청 스레드에서 부른다. 계산과 저장은 넘기고 바로 돌아온다. */
    void settled(long userId, long roundId, int rulesVersion, Instant startedAt, long minimumElapsedUs,
            List<Integer> offsets, String inputHash, Instant receivedAt) {
        try {
            Boolean connected = inPark == null ? null : inPark.test(userId);
            var jumps = List.copyOf(offsets);
            writer.execute(() -> record(userId, roundId, rulesVersion, startedAt, minimumElapsedUs, jumps, inputHash,
                    receivedAt, connected));
        } catch (RejectedExecutionException closing) {
            log.debug("줄넘기 기록 저장소가 닫혀 판 기록을 남기지 않습니다. roundId={}", roundId);
        } catch (RuntimeException failure) {
            log.warn("줄넘기 판 기록을 넘기지 못했습니다. roundId={}", roundId, failure);
        }
    }

    private void record(long userId, long roundId, int rulesVersion, Instant startedAt, long minimumElapsedUs,
            List<Integer> offsets, String inputHash, Instant receivedAt, Boolean connected) {
        try {
            var signals = JumpRopeMacroSignals.analyze(offsets, rulesVersion);
            int duplicates = 0;
            if (offsets.size() >= DUPLICATE_MIN_JUMPS) {
                Integer found = jdbc.queryForObject("""
                        SELECT COUNT(*) FROM jump_rope_rounds
                        WHERE input_hash = ? AND id <> ? AND status = 'SETTLED'
                        """, Integer.class, inputHash, roundId);
                duplicates = found == null ? 0 : found;
            }
            long submitDelayMs = Duration.between(startedAt.plus(minimumElapsedUs, ChronoUnit.MICROS), receivedAt)
                    .toMillis();
            String json = offsets.stream().map(String::valueOf).collect(Collectors.joining(",", "[", "]"));
            jdbc.update("""
                    INSERT IGNORE INTO jump_rope_audits (round_id, user_id, rules_version, jump_offsets, jump_count,
                        jitter_us, lead_mean_us, lead_sd_us, whole_ms_jumps, submit_delay_ms, in_park,
                        duplicate_rounds, duplicate_log, steady_rhythm, received_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(? / 1000))
                    """, roundId, userId, rulesVersion, json, signals.jumpCount(), signals.jitterUs(),
                    signals.leadMeanUs(), signals.leadSdUs(), signals.wholeMsJumps(), submitDelayMs, connected,
                    duplicates, duplicates > 0, signals.steadyRhythm(), receivedAt.toEpochMilli());
            if (duplicates > 0 || signals.steadyRhythm()) {
                log.info("줄넘기 매크로 의심 판 기록 roundId={} userId={} duplicates={} jitterUs={}", roundId, userId,
                        duplicates, signals.jitterUs());
            }
        } catch (RuntimeException failure) {
            log.warn("줄넘기 판 기록을 저장하지 못했습니다. roundId={} reason={}", roundId, failure.getMessage());
        }
    }

    public Report report(Instant at) {
        return new Report(true, LIMIT, suspects(), duplicateLogs(), at);
    }

    /** 한 번 이상 의심 기록이 남은 회원. 의심 판이 많은 순, 같으면 최근 순. */
    private List<Suspect> suspects() {
        return jdbc.query("""
                SELECT a.user_id, u.nickname, u.deleted_at IS NOT NULL AS withdrawn,
                       SUM(a.duplicate_log OR a.steady_rhythm) AS flagged_rounds,
                       SUM(a.duplicate_log) AS duplicate_rounds, SUM(a.steady_rhythm) AS steady_rounds,
                       COUNT(*) AS audited_rounds,
                       COALESCE(SUM(a.in_park = FALSE), 0) AS outside_park_rounds,
                       MAX(r.score) AS best_score, MIN(a.jitter_us) AS lowest_jitter_us,
                       CAST(UNIX_TIMESTAMP(MIN(CASE WHEN a.duplicate_log OR a.steady_rhythm THEN a.received_at END))
                           * 1000 AS SIGNED) AS first_ms,
                       CAST(UNIX_TIMESTAMP(MAX(CASE WHEN a.duplicate_log OR a.steady_rhythm THEN a.received_at END))
                           * 1000 AS SIGNED) AS last_ms
                FROM jump_rope_audits a
                JOIN users u ON u.id = a.user_id
                JOIN jump_rope_rounds r ON r.id = a.round_id
                GROUP BY a.user_id, u.nickname, u.deleted_at
                HAVING flagged_rounds > 0
                ORDER BY flagged_rounds DESC, last_ms DESC, a.user_id ASC
                LIMIT ?
                """, (row, index) -> new Suspect(Long.toString(row.getLong("user_id")), row.getString("nickname"),
                row.getBoolean("withdrawn"), row.getInt("flagged_rounds"), row.getInt("duplicate_rounds"),
                row.getInt("steady_rounds"), row.getInt("audited_rounds"), row.getInt("outside_park_rounds"),
                (Integer) row.getObject("best_score", Integer.class),
                (Integer) row.getObject("lowest_jitter_us", Integer.class),
                Instant.ofEpochMilli(row.getLong("first_ms")), Instant.ofEpochMilli(row.getLong("last_ms"))), LIMIT);
    }

    /** 기록 저장을 시작하기 전의 판까지 포함해, 같은 점프 기록이 두 번 이상 제출된 묶음. */
    private List<DuplicateLog> duplicateLogs() {
        return jdbc.query("""
                SELECT r.input_hash, COUNT(*) AS rounds, COUNT(DISTINCT r.user_id) AS members,
                       GROUP_CONCAT(DISTINCT r.user_id ORDER BY r.user_id SEPARATOR ',') AS user_ids,
                       MAX(r.score) AS score,
                       CAST(UNIX_TIMESTAMP(MIN(r.completed_at)) * 1000 AS SIGNED) AS first_ms,
                       CAST(UNIX_TIMESTAMP(MAX(r.completed_at)) * 1000 AS SIGNED) AS last_ms
                FROM jump_rope_rounds r
                WHERE r.status = 'SETTLED' AND r.perfect_count + r.good_count >= ?
                GROUP BY r.input_hash
                HAVING COUNT(*) > 1
                ORDER BY rounds DESC, last_ms DESC, r.input_hash ASC
                LIMIT ?
                """, (row, index) -> {
            var userIds = new ArrayList<String>();
            String joined = row.getString("user_ids");
            if (joined != null) {
                for (String id : joined.split(",")) {
                    if (userIds.size() < 10 && !id.isBlank()) userIds.add(id);
                }
            }
            return new DuplicateLog(row.getString("input_hash"), row.getInt("rounds"), row.getInt("members"),
                    List.copyOf(userIds), row.getInt("score"), Instant.ofEpochMilli(row.getLong("first_ms")),
                    Instant.ofEpochMilli(row.getLong("last_ms")));
        }, DUPLICATE_MIN_JUMPS, DUPLICATE_GROUPS);
    }

    @Override
    public void close() {
        writer.shutdown();
    }
}
