package com.ssafy.ontop.event.minigame;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;

/** Configuration lives beside the existing event round and prize slot. */
public final class WeeklyMinigameRepository {
    private final JdbcTemplate jdbc;

    public WeeklyMinigameRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ConfiguredGame> game(String code, LocalDate week, boolean locked) {
        return jdbc.query("""
                SELECT r.id, r.week_start_date, r.starts_at, r.ends_at, r.announces_at,
                       r.finalized_at, c.game_code, c.display_name, c.ranking_rule_version,
                       c.enabled, s.id AS slot_id, s.prize_name
                FROM event_rounds r
                JOIN event_minigame_configs c ON c.event_round_id = r.id
                JOIN event_prize_slots s ON s.event_round_id = r.id AND s.place = 1 AND s.slot_number = 1
                WHERE r.event_type = ? AND r.week_start_date = ?
                """ + (locked ? " FOR UPDATE" : ""), this::configuredGame,
                code, java.sql.Date.valueOf(week)).stream().findFirst();
    }

    public List<ConfiguredGame> games(LocalDate week) {
        return jdbc.query("""
                SELECT r.id, r.week_start_date, r.starts_at, r.ends_at, r.announces_at,
                       r.finalized_at, c.game_code, c.display_name, c.ranking_rule_version,
                       c.enabled, s.id AS slot_id, s.prize_name
                FROM event_rounds r
                JOIN event_minigame_configs c ON c.event_round_id = r.id
                JOIN event_prize_slots s ON s.event_round_id = r.id AND s.place = 1 AND s.slot_number = 1
                WHERE r.week_start_date = ? AND c.enabled = TRUE
                ORDER BY c.game_code
                """, this::configuredGame, java.sql.Date.valueOf(week));
    }

    public boolean roundExists(String code, LocalDate week) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_rounds WHERE event_type = ? AND week_start_date = ?
                """, Integer.class, code, java.sql.Date.valueOf(week)) > 0;
    }

    public void create(String code, LocalDate week, Instant startsAt, Instant endsAt, Instant announcesAt,
            String displayName, String ruleVersion, boolean enabled, String prizeName, long adminId, Instant now) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at, announces_at)
                    VALUES (?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, code);
            statement.setDate(2, java.sql.Date.valueOf(week));
            statement.setTimestamp(3, Timestamp.from(startsAt));
            statement.setTimestamp(4, Timestamp.from(endsAt));
            statement.setTimestamp(5, Timestamp.from(announcesAt));
            return statement;
        }, key);
        Number generated = key.getKey();
        if (generated == null) {
            throw new IllegalStateException("생성된 미니게임 회차 ID를 확인할 수 없습니다.");
        }
        long roundId = generated.longValue();
        jdbc.update("""
                INSERT INTO event_minigame_configs(event_round_id, game_code, display_name,
                    ranking_rule_version, enabled, configured_by_user_id, configured_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, roundId, code, displayName, ruleVersion, enabled, adminId, Timestamp.from(now));
        jdbc.update("""
                INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)
                VALUES (?, 1, 1, ?)
                """, roundId, prizeName);
    }

    public void update(ConfiguredGame current, Instant startsAt, Instant endsAt, Instant announcesAt,
            String displayName, String ruleVersion, boolean enabled, String prizeName, long adminId, Instant now) {
        jdbc.update("""
                UPDATE event_rounds SET starts_at = ?, ends_at = ?, announces_at = ? WHERE id = ?
                """, Timestamp.from(startsAt), Timestamp.from(endsAt), Timestamp.from(announcesAt), current.id());
        jdbc.update("""
                UPDATE event_minigame_configs SET display_name = ?, ranking_rule_version = ?,
                    enabled = ?, configured_by_user_id = ?, configured_at = ? WHERE event_round_id = ?
                """, displayName, ruleVersion, enabled, adminId, Timestamp.from(now), current.id());
        jdbc.update("UPDATE event_prize_slots SET prize_name = ? WHERE id = ?", prizeName, current.slotId());
    }

    public int slotCount(long roundId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM event_prize_slots WHERE event_round_id = ?",
                Integer.class, roundId);
    }

    private ConfiguredGame configuredGame(ResultSet rows, int index) throws SQLException {
        Timestamp finalizedAt = rows.getTimestamp("finalized_at");
        return new ConfiguredGame(rows.getLong("id"), rows.getDate("week_start_date").toLocalDate(),
                rows.getTimestamp("starts_at").toInstant(), rows.getTimestamp("ends_at").toInstant(),
                rows.getTimestamp("announces_at").toInstant(),
                finalizedAt == null ? null : finalizedAt.toInstant(),
                rows.getString("game_code"), rows.getString("display_name"),
                rows.getString("ranking_rule_version"), rows.getBoolean("enabled"),
                rows.getLong("slot_id"), rows.getString("prize_name"));
    }

    public record ConfiguredGame(long id, LocalDate week, Instant startsAt, Instant endsAt,
            Instant announcesAt, Instant finalizedAt, String gameCode, String displayName,
            String rankingRuleVersion, boolean enabled, long slotId, String prizeName) {}
}
