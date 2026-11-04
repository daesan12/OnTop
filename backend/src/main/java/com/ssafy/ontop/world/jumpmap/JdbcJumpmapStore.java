package com.ssafy.ontop.world.jumpmap;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** MySQL 저장. 지갑은 기존 Wallet 엔티티의 비관적 잠금·creditReward를 재사용하고 원장 멱등 키로 이중 지급을 막는다. */
@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.world.jumpmap.enabled", havingValue = "true")
public class JdbcJumpmapStore implements JumpmapStore {
    private static final String REWARD_TYPE = "JUMP_GATE_REWARD";
    private final JdbcTemplate jdbc;
    private final EntityManager entities;
    private final TransactionTemplate transactions;
    private final ObjectMapper json = new ObjectMapper();
    private final JumpmapRankingSnapshot rankings;

    public JdbcJumpmapStore(JdbcTemplate jdbc, EntityManager entities, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.entities = entities;
        this.transactions = new TransactionTemplate(transactions);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.rankings = new JumpmapRankingSnapshot(this::loadRanking, Clock.systemUTC());
    }

    /** 원장 멱등 키. (판, 문)마다 하나다. */
    public static String rewardKey(String runId, int gate) {
        return "jumpmap:" + runId + ":" + gate;
    }

    /** 운영처럼 db/minigame 위치를 적용하지 않은 DB에서는 테이블이 없다. 조회 실패도 준비 안 됨으로 본다. */
    @Override
    public boolean ready() {
        try {
            Integer tables = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME IN ('jump_runs', 'jump_gate_rewards', 'jump_daily_earnings', 'jump_profiles')
                    """, Integer.class);
            return tables != null && tables == 4;
        } catch (org.springframework.dao.DataAccessException exception) {
            return false;
        }
    }

    @Override
    public Started start(String runId, long userId, String channelId, Instant at) {
        return transaction(() -> {
            boolean first = touchProfile(userId, at);
            jdbc.update("""
                    INSERT INTO jump_runs(id, user_id, channel_id, status, rules_version, course_version, is_first_run,
                        started_at, gate_times_ms)
                    VALUES (?, ?, ?, 'STARTED', ?, ?, ?, ?, JSON_ARRAY())
                    """, runId, userId, channelId, JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, first, time(at));
            LocalDate today = JumpmapStore.kstDate(at);
            return new Started(first, earned(userId, today, false), today);
        });
    }

    @Override
    public Ranking ranking(long userId) {
        return rankings.ranking(userId);
    }

    private List<RankingEntry> loadRanking() {
        return transaction(() -> {
            var rows = jdbc.queryForList("""
                    WITH choices AS (
                        SELECT r.user_id, r.finish_ms, r.ended_at, u.nickname,
                            ROW_NUMBER() OVER (PARTITION BY r.user_id
                            ORDER BY r.finish_ms, r.ended_at, r.id) AS choice
                        FROM jump_runs r JOIN users u ON u.id = r.user_id
                        WHERE r.status = 'ENDED' AND r.end_reason = 'FINISH' AND %s
                          AND r.finish_ms > 0 AND r.final_reached = TRUE AND r.gates_passed = 7
                          AND r.rules_version = ? AND r.course_version = ? AND u.deleted_at IS NULL
                    )
                    SELECT RANK() OVER (ORDER BY finish_ms) AS place, user_id, nickname, finish_ms, ended_at
                    FROM choices WHERE choice = 1 ORDER BY finish_ms, ended_at, user_id
                    """.formatted(JumpmapRankingEligibility.SQL), JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION);
            var items = new ArrayList<RankingEntry>();
            for (var row : rows) {
                items.add(new RankingEntry(((Number) row.get("place")).intValue(),
                        row.get("user_id").toString(), String.valueOf(row.get("nickname")),
                        ((Number) row.get("finish_ms")).longValue(),
                        ((Timestamp) row.get("ended_at")).toLocalDateTime().toInstant(ZoneOffset.UTC).toString()));
            }
            return List.copyOf(items);
        });
    }

    @Override
    public boolean passGate(String runId, long userId, int gate, int coinsCalculated, long elapsedMs, Instant at) {
        return transaction(() -> {
            var runs = jdbc.queryForList("SELECT status, gates_passed FROM jump_runs WHERE id = ? AND user_id = ? FOR UPDATE",
                    runId, userId);
            if (runs.isEmpty()) return false;
            Integer existing = jdbc.query("SELECT gate FROM jump_gate_rewards WHERE run_id = ? AND gate = ?",
                    rs -> rs.next() ? rs.getInt(1) : null, runId, gate);
            if (existing != null) return true;
            var run = runs.getFirst();
            if (!"STARTED".equals(run.get("status")) || ((Number) run.get("gates_passed")).intValue() != gate - 1) {
                return false;
            }
            jdbc.update("""
                    UPDATE jump_runs SET gates_passed = ?, gate_times_ms = JSON_ARRAY_APPEND(gate_times_ms, '$', ?)
                    WHERE id = ?
                    """, gate, elapsedMs, runId);
            jdbc.update("""
                    INSERT INTO jump_gate_rewards(run_id, gate, user_id, kst_date, coins_calculated, status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
                    """, runId, gate, userId, Date.valueOf(JumpmapStore.kstDate(at)), coinsCalculated, time(at));
            return true;
        });
    }

    @Override
    public Optional<Settled> settle(String runId, int gate, Instant now) {
        return transaction(() -> {
            var rows = jdbc.queryForList("""
                    SELECT user_id, kst_date, coins_calculated, coins_granted, status
                    FROM jump_gate_rewards WHERE run_id = ? AND gate = ? FOR UPDATE
                    """, runId, gate);
            if (rows.isEmpty()) return Optional.<Settled>empty();
            var row = rows.getFirst();
            long userId = ((Number) row.get("user_id")).longValue();
            int calculated = ((Number) row.get("coins_calculated")).intValue();
            int granted;
            if ("GRANTED".equals(row.get("status"))) {
                granted = ((Number) row.get("coins_granted")).intValue();
            } else {
                int earned = earned(userId, JumpmapStore.kstDate(now), true);
                granted = MinigameRewardBudget.grant(calculated, earned);
                if (granted > 0) {
                    credit(userId, granted, rewardKey(runId, gate), now);
                    // V131의 게임별 일일 카운터는 보존하고 실제 지급 원장을 공통 기준으로 사용한다.
                    jdbc.update("UPDATE jump_runs SET coins_granted = coins_granted + ? WHERE id = ?", granted, runId);
                }
                jdbc.update("""
                        UPDATE jump_gate_rewards SET status = 'GRANTED', coins_granted = ?, settled_at = ?
                        WHERE run_id = ? AND gate = ?
                        """, granted, time(now), runId, gate);
            }
            Integer runCoins = jdbc.queryForObject("SELECT coins_granted FROM jump_runs WHERE id = ?", Integer.class, runId);
            LocalDate today = JumpmapStore.kstDate(now);
            return Optional.of(new Settled(runId, userId, gate, calculated, granted, runCoins, earned(userId, today, false), today));
        });
    }

    @Override
    public Ended end(String runId, RunEnd end) {
        Ended result = transaction(() -> {
            var rows = jdbc.queryForList("SELECT user_id, status, coins_granted FROM jump_runs WHERE id = ? FOR UPDATE", runId);
            if (rows.isEmpty()) throw new IllegalStateException("점프맵 판이 없습니다.");
            var row = rows.getFirst();
            long userId = ((Number) row.get("user_id")).longValue();
            boolean newBest = false;
            if ("STARTED".equals(row.get("status"))) {
                jdbc.update("""
                        UPDATE jump_runs SET status = 'ENDED', end_reason = ?, ended_at = ?, elapsed_ms = ?, finish_ms = ?,
                            gates_passed = GREATEST(gates_passed, ?), final_reached = ?, max_height = ?, landings = ?,
                            suspicious = ?, suspicious_reasons = ?
                        WHERE id = ?
                        """, end.reason().name(), time(end.endedAt()), end.elapsedMs(), end.finishMs(), end.gatesPassed(),
                        end.finalReached(), end.maxHeight(), write(end.landings()), end.suspicious(), write(end.reasons()), runId);
                // 13장: 의심 판은 개인 최고 기록에 넣지 않는다. 동점은 새 기록이 아니다.
                if (end.reason() == JumpRun.EndReason.FINISH && end.finishMs() != null && !end.suspicious()) {
                    touchProfile(userId, null);
                    Long best = best(userId, runId);
                    if (best == null || end.finishMs() < best) {
                        newBest = true;
                        jdbc.update("UPDATE jump_profiles SET best_finish_ms = ?, best_run_id = ?, updated_at = ? WHERE user_id = ?",
                                end.finishMs(), runId, time(end.endedAt()), userId);
                    }
                }
            }
            Long best = best(userId, "");
            int runCoins = ((Number) row.get("coins_granted")).intValue();
            LocalDate today = JumpmapStore.kstDate(end.endedAt());
            return new Ended(runCoins, earned(userId, today, false), today, best, newBest);
        });
        // 저장 커밋 후, 완료 이벤트가 전달되기 전에 이전 랭킹을 비운다.
        if (result.newBest()) {
            rankings.invalidate();
        }
        return result;
    }

    @Override
    public Status status(long userId, Instant now) {
        return transaction(() -> {
            var rows = jdbc.queryForList("SELECT first_run_at, seen_tips, best_finish_ms FROM jump_profiles WHERE user_id = ?", userId);
            LocalDate today = JumpmapStore.kstDate(now);
            int earned = earned(userId, today, false);
            if (rows.isEmpty()) return new Status(true, List.of(), null, earned, today);
            var row = rows.getFirst();
            return new Status(row.get("first_run_at") == null, read(String.valueOf(row.get("seen_tips"))),
                    best(userId, ""), earned, today);
        });
    }

    @Override
    public void seeTips(long userId, Set<String> tips, Instant now) {
        transaction(() -> {
            jdbc.update("""
                    INSERT INTO jump_profiles(user_id, seen_tips, updated_at) VALUES (?, JSON_ARRAY(), ?)
                    ON DUPLICATE KEY UPDATE user_id = user_id
                    """, userId, time(now));
            String current = jdbc.queryForObject("SELECT seen_tips FROM jump_profiles WHERE user_id = ? FOR UPDATE",
                    String.class, userId);
            var merged = new LinkedHashSet<>(read(current));
            tips.stream().filter(TIPS::contains).sorted().forEach(merged::add);
            jdbc.update("UPDATE jump_profiles SET seen_tips = ?, updated_at = ? WHERE user_id = ?",
                    write(List.copyOf(merged)), time(now), userId);
            return null;
        });
    }

    @Override
    public int abandonOpenRuns(Instant now) {
        return transaction(() -> jdbc.update("""
                UPDATE jump_runs SET status = 'ENDED', end_reason = 'DISCONNECT', ended_at = ?,
                    elapsed_ms = TIMESTAMPDIFF(MICROSECOND, started_at, ?) DIV 1000
                WHERE status = 'STARTED'
                """, time(now), time(now)));
    }

    @Override
    public List<RewardKey> pendingRewards(Instant createdBefore, int limit) {
        return jdbc.query("""
                SELECT run_id, gate FROM jump_gate_rewards WHERE status = 'PENDING' AND created_at < ?
                ORDER BY created_at LIMIT ?
                """, (rs, i) -> new RewardKey(rs.getString(1), rs.getInt(2)), time(createdBefore), limit);
    }

    /** 첫 판 시작이면 true. at이 null이면 프로필 행만 보장한다. */
    private boolean touchProfile(long userId, Instant at) {
        Instant now = at == null ? Instant.now() : at;
        jdbc.update("""
                INSERT INTO jump_profiles(user_id, seen_tips, updated_at) VALUES (?, JSON_ARRAY(), ?)
                ON DUPLICATE KEY UPDATE user_id = user_id
                """, userId, time(now));
        Timestamp first = jdbc.queryForObject("SELECT first_run_at FROM jump_profiles WHERE user_id = ? FOR UPDATE",
                Timestamp.class, userId);
        if (at == null || first != null) return false;
        jdbc.update("UPDATE jump_profiles SET first_run_at = ?, updated_at = ? WHERE user_id = ?", time(at), time(at), userId);
        return true;
    }

    private Long best(long userId, String excludedRun) {
        return jdbc.queryForObject("""
                SELECT MIN(finish_ms) FROM jump_runs r
                WHERE user_id = ? AND id <> ? AND status = 'ENDED' AND end_reason = 'FINISH'
                  AND %s AND gates_passed = 7 AND final_reached = TRUE
                  AND rules_version = ? AND course_version = ? AND finish_ms > 0
                """.formatted(JumpmapRankingEligibility.SQL), Long.class, userId, excludedRun,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION);
    }

    private int earned(long userId, LocalDate date, boolean lock) {
        if (lock) {
            var wallets = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                    .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
            if (wallets.isEmpty()) {
                throw new IllegalStateException("지갑이 없는 회원입니다.");
            }
        }
        Instant from = date.atStartOfDay(KST).toInstant();
        return Math.toIntExact(MinigameRewardBudget.earned(entities, userId, from,
                date.plusDays(1).atStartOfDay(KST).toInstant()));
    }

    private void credit(long userId, int amount, String key, Instant now) {
        var wallets = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        if (wallets.isEmpty()) throw new IllegalStateException("지갑이 없는 회원입니다.");
        Wallet wallet = wallets.getFirst();
        entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE);
        wallet.creditReward(amount);
        entities.flush();
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta, reserved_delta, idempotency_key, created_at)
                VALUES (?, ?, ?, 0, ?, ?)
                """, wallet.id(), REWARD_TYPE, amount, key, time(now));
    }

    /** 잠금 경합(교착·대기 초과)은 같은 트랜잭션을 처음부터 몇 번 다시 시도한다. */
    private <T> T transaction(Supplier<T> work) {
        for (int attempt = 1; ; attempt++) {
            try {
                return transactions.execute(status -> work.get());
            } catch (TransientDataAccessException exception) {
                if (attempt >= 3) throw exception;
            }
        }
    }

    // JDBC와 JPA 원장이 같은 UTC 시각을 써야 JVM 시간대와 무관하게 KST 일일 상한을 집계한다.
    private static LocalDateTime time(Instant at) { return LocalDateTime.ofInstant(at, ZoneOffset.UTC); }

    private String write(List<?> values) {
        try {
            return json.writeValueAsString(values == null ? List.of() : values);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private List<String> read(String value) {
        try {
            return value == null ? List.of() : new ArrayList<>(json.readValue(value, new TypeReference<List<String>>() { }));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
