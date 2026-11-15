package com.ssafy.ontop.game.jumprope;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

final class JumpRopeRepository {
    private static final String BESTS = """
            WITH choices AS (
                SELECT r.id, r.user_id, r.score, r.miss_count, r.completed_at, u.nickname,
                       ROW_NUMBER() OVER (PARTITION BY r.user_id
                           ORDER BY r.score DESC, r.miss_count ASC, r.completed_at ASC, r.id ASC) AS choice
                FROM jump_rope_rounds r JOIN users u ON u.id = r.user_id
                WHERE r.status = 'SETTLED' AND r.rules_version = ? AND u.deleted_at IS NULL
            ), ranked AS (
                SELECT *, RANK() OVER (ORDER BY score DESC, miss_count ASC) AS place
                FROM choices WHERE choice = 1
            )
            """;

    record Row(long id, long seed, int rulesVersion, Instant startedAt, Instant expiresAt,
               JumpRopeDtos.Result result, String inputHash) { }

    private final JdbcTemplate jdbc;

    JumpRopeRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // Both writers lock the user before touching the round so a new start cannot race an older finish.
    boolean lockUser(long userId) {
        return !jdbc.queryForList("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
                Long.class, userId).isEmpty();
    }

    /** Inserts a round under the configured rules version, or returns the existing row for the same key unchanged. */
    Row start(long userId, String key, long seed, int rulesVersion, Instant startedAt, Instant expiresAt) {
        jdbc.update("""
                INSERT INTO jump_rope_rounds (user_id, request_key, seed, rules_version, status, started_at, expires_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?) ON DUPLICATE KEY UPDATE id = id
                """, userId, key, seed, rulesVersion, Timestamp.from(startedAt), Timestamp.from(expiresAt));
        return jdbc.queryForObject("SELECT * FROM jump_rope_rounds WHERE user_id = ? AND request_key = ?",
                JumpRopeRepository::row, userId, key);
    }

    Optional<Row> lockRound(long userId, long id) {
        return jdbc.query("SELECT * FROM jump_rope_rounds WHERE user_id = ? AND id = ? FOR UPDATE",
                JumpRopeRepository::row, userId, id).stream().findFirst();
    }

    long latestId(long userId) {
        return jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM jump_rope_rounds WHERE user_id = ?", Long.class, userId);
    }

    void settle(long id, JumpRopeRules.Result result, Instant at, String inputHash) {
        int updated = jdbc.update("""
                UPDATE jump_rope_rounds
                SET status = 'SETTLED', score = ?, perfect_count = ?, good_count = ?, miss_count = ?,
                    end_reason = ?, completed_at = ?, input_hash = ?
                WHERE id = ? AND status = 'ACTIVE'
                """, result.score(), result.perfect(), result.good(), result.miss(), result.reason().wireValue(),
                Timestamp.from(at), inputHash, id);
        if (updated != 1) throw new DataIntegrityViolationException("Jump rope settlement must update one active round");
    }

    // Each rules version keeps its own board; records of other versions stay in the table untouched.
    List<JumpRopeDtos.Item> ranked(int rulesVersion, int limit, int offset) {
        return jdbc.query(BESTS + """
                SELECT place, nickname, score FROM ranked
                ORDER BY score DESC, miss_count ASC, completed_at ASC, id ASC LIMIT ? OFFSET ?
                """, JumpRopeRepository::item, rulesVersion, limit, offset);
    }

    JumpRopeDtos.PersonalBest me(int rulesVersion, long userId) {
        return jdbc.query(BESTS + "SELECT place, nickname, score FROM ranked WHERE user_id = ?",
                JumpRopeRepository::item, rulesVersion, userId).stream().findFirst()
                .map(item -> new JumpRopeDtos.PersonalBest(item.rank(), item.nickname(), item.score())).orElse(null);
    }

    long participants(int rulesVersion) {
        return jdbc.queryForObject("""
                SELECT COUNT(DISTINCT r.user_id) FROM jump_rope_rounds r JOIN users u ON u.id = r.user_id
                WHERE r.status = 'SETTLED' AND r.rules_version = ? AND u.deleted_at IS NULL
                """, Long.class, rulesVersion);
    }

    private static JumpRopeDtos.Item item(ResultSet row, int index) throws SQLException {
        return new JumpRopeDtos.Item(row.getLong("place"), row.getString("nickname"), row.getInt("score"));
    }

    private static Row row(ResultSet row, int index) throws SQLException {
        long id = row.getLong("id");
        int version = row.getInt("rules_version");
        JumpRopeDtos.Result result = null;
        if ("SETTLED".equals(row.getString("status"))) {
            var counts = new JumpRopeDtos.Counts(row.getInt("perfect_count"), row.getInt("good_count"), row.getInt("miss_count"));
            result = new JumpRopeDtos.Result(Long.toString(id), version, row.getInt("score"), counts,
                    row.getString("end_reason"), row.getTimestamp("completed_at").toInstant(), 0);
        }
        return new Row(id, row.getLong("seed"), version, row.getTimestamp("started_at").toInstant(),
                row.getTimestamp("expires_at").toInstant(), result, row.getString("input_hash"));
    }
}
