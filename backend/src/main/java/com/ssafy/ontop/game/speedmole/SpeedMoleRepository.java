package com.ssafy.ontop.game.speedmole;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

public class SpeedMoleRepository {
    public record Row(long id, long userId, long seed, int version, String status, Instant startedAt,
                       Instant completedAt, Integer score, Integer hits, Integer misses) { }
    private final JdbcTemplate jdbc;
    public SpeedMoleRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Row start(long user, String key, long seed, Instant at) {
        // The unique key makes ambiguous retries/multi-tab identical starts share one row.
        jdbc.update("INSERT INTO speed_mole_rounds (user_id,request_key,seed,rules_version,status,started_at) "
                + "VALUES (?,?,?,?,'ACTIVE',?) ON DUPLICATE KEY UPDATE id=id", user, key, seed,
                SpeedMoleRules.VERSION, Timestamp.from(at));
        return jdbc.query("SELECT * FROM speed_mole_rounds WHERE user_id=? AND request_key=?",
                SpeedMoleRepository::row, user, key).getFirst();
    }
    public Row lock(long user, long id) {
        return jdbc.query("SELECT * FROM speed_mole_rounds WHERE user_id=? AND id=? FOR UPDATE",
                SpeedMoleRepository::row, user, id).stream().findFirst().orElseThrow(() ->
                new SpeedMoleException(404, "SPEED_MOLE_ROUND_NOT_FOUND", "내 경기 기록을 찾을 수 없어요."));
    }
    public void settle(long id, SpeedMoleRules.Score score, Instant at) {
        jdbc.update("UPDATE speed_mole_rounds SET status='SETTLED', score=?, hits=?, misses=?, completed_at=? "
                + "WHERE id=? AND status='ACTIVE'", score.score(), score.hits(), score.misses(), Timestamp.from(at), id);
    }
    public long latestId(long user) {
        return jdbc.queryForObject("SELECT COALESCE(MAX(id),0) FROM speed_mole_rounds WHERE user_id=?", Long.class, user);
    }
    public List<SpeedMoleDtos.Item> ranked(int limit, int offset) {
        return jdbc.query(BESTS + "SELECT * FROM ranked ORDER BY score DESC, misses ASC, completed_at ASC, id ASC LIMIT ? OFFSET ?",
                SpeedMoleRepository::item, limit, offset);
    }
    public SpeedMoleDtos.Item me(long user) {
        return jdbc.query(BESTS + "SELECT * FROM ranked WHERE user_id=?", SpeedMoleRepository::item, user)
                .stream().findFirst().orElse(null);
    }
    public long participants() {
        return jdbc.queryForObject("SELECT COUNT(DISTINCT r.user_id) FROM speed_mole_rounds r JOIN users u ON u.id=r.user_id "
                + "WHERE r.status='SETTLED' AND r.rules_version=1 AND u.deleted_at IS NULL", Long.class);
    }
    private static final String BESTS = """
        WITH choices AS (
            SELECT r.*, u.nickname, ROW_NUMBER() OVER (PARTITION BY r.user_id
                ORDER BY r.score DESC, r.misses ASC, r.completed_at ASC, r.id ASC) AS choice
            FROM speed_mole_rounds r JOIN users u ON u.id=r.user_id
            WHERE r.status='SETTLED' AND r.rules_version=1 AND u.deleted_at IS NULL
        ), ranked AS (
            SELECT *, RANK() OVER (ORDER BY score DESC, misses ASC) AS place FROM choices WHERE choice=1
        )
        """;
    private static SpeedMoleDtos.Item item(ResultSet rs, int n) throws SQLException {
        return new SpeedMoleDtos.Item(rs.getLong("place"), rs.getString("user_id"), rs.getString("nickname"),
                rs.getInt("score"), rs.getInt("hits"), rs.getInt("misses"), rs.getTimestamp("completed_at").toInstant());
    }
    private static Row row(ResultSet rs, int n) throws SQLException {
        Timestamp completed = rs.getTimestamp("completed_at");
        return new Row(rs.getLong("id"), rs.getLong("user_id"), rs.getLong("seed"), rs.getInt("rules_version"),
                rs.getString("status"), rs.getTimestamp("started_at").toInstant(), completed == null ? null : completed.toInstant(),
                rs.getObject("score", Integer.class), rs.getObject("hits", Integer.class), rs.getObject("misses", Integer.class));
    }
}
