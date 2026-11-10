package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.event.minigame.MinigameAwardResponse.Winner;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapRankingEligibility;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

/** Reads the persisted game records rather than the short-lived public ranking snapshots. */
public final class MinigameAwardRepository {
    private final JdbcTemplate jdbc;

    public MinigameAwardRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void ensureRound(MinigameAwardType type, LocalDate week, Instant startsAt,
            Instant endsAt, Instant announcesAt) {
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at, announces_at)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """, type.name(), java.sql.Date.valueOf(week), Timestamp.from(startsAt),
                Timestamp.from(endsAt), Timestamp.from(announcesAt));
    }

    public Optional<Round> round(MinigameAwardType type, LocalDate week, boolean locked) {
        String sql = """
                SELECT id, week_start_date, starts_at, ends_at, announces_at, finalized_at
                FROM event_rounds WHERE event_type = ? AND week_start_date = ?
                """ + (locked ? " FOR UPDATE" : "");
        return jdbc.query(sql, (rows, index) -> round(rows), type.name(),
                java.sql.Date.valueOf(week)).stream().findFirst();
    }

    public void ensureSlot(long roundId, String prizeName) {
        jdbc.update("""
                INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)
                VALUES (?, 1, 1, ?)
                ON DUPLICATE KEY UPDATE id = id
                """, roundId, prizeName);
    }

    public List<Slot> slots(long roundId) {
        return jdbc.query("""
                SELECT id, place, slot_number, prize_name FROM event_prize_slots
                WHERE event_round_id = ? ORDER BY place, slot_number
                """, (rows, index) -> new Slot(rows.getLong("id"), rows.getInt("place"),
                rows.getInt("slot_number"), rows.getString("prize_name")), roundId);
    }

    public List<Candidate> candidates(MinigameAwardType type, Instant startsAt, Instant endsAt) {
        return type == MinigameAwardType.BUNGEOPPANG
                ? bungeoppangCandidates(startsAt, endsAt)
                : jumpmapCandidates(startsAt, endsAt);
    }

    private List<Candidate> bungeoppangCandidates(Instant startsAt, Instant endsAt) {
        return jdbc.query("""
                WITH completed AS (
                    SELECT s.id AS record_id, s.user_id, s.score, r.settled_at,
                           JSON_EXTRACT(IF(JSON_VALID(b.result_json), b.result_json, '{}'), '$.made') AS made_json,
                           JSON_EXTRACT(IF(JSON_VALID(b.result_json), b.result_json, '{}'), '$.failed') AS failed_json,
                           JSON_EXTRACT(IF(JSON_VALID(b.result_json), b.result_json, '{}'), '$.maxCombo') AS combo_json
                    FROM minigame_sessions s
                    JOIN bungeoppang_records b ON b.minigame_session_id = s.id
                    JOIN bungeoppang_v4_rounds r ON r.minigame_session_id = s.id
                    JOIN users u ON u.id = s.user_id
                    WHERE s.minigame_type = 'BUNGEOPPANG' AND s.status = 'COMPLETED'
                      AND s.ended_at IS NOT NULL AND r.terminal_reason = 'VERIFIED'
                      AND r.settled_at >= ? AND r.settled_at < ?
                      AND b.rules_version = ?
                      AND TIMESTAMPDIFF(MICROSECOND, r.play_starts_at, r.play_ends_at) = ?
                      AND s.score BETWEEN 0 AND 9007199254740991 AND u.deleted_at IS NULL
                ), valid_scores AS (
                    SELECT record_id, user_id, score, settled_at,
                           CAST(JSON_UNQUOTE(combo_json) AS UNSIGNED) AS max_combo
                    FROM completed
                    WHERE JSON_TYPE(made_json) = 'INTEGER'
                      AND JSON_TYPE(failed_json) = 'INTEGER'
                      AND JSON_TYPE(combo_json) = 'INTEGER'
                      AND JSON_UNQUOTE(made_json) REGEXP '^[0-9]{1,10}$'
                      AND JSON_UNQUOTE(failed_json) REGEXP '^[0-9]{1,10}$'
                      AND JSON_UNQUOTE(combo_json) REGEXP '^[0-9]{1,10}$'
                ), choices AS (
                    SELECT valid_scores.*,
                           ROW_NUMBER() OVER (PARTITION BY user_id
                               ORDER BY score DESC, max_combo DESC, settled_at ASC, record_id ASC) AS choice
                    FROM valid_scores
                )
                SELECT choices.record_id, choices.user_id, u.nickname, score, settled_at, max_combo
                FROM choices JOIN users u ON u.id = choices.user_id WHERE choice = 1
                ORDER BY score DESC, max_combo DESC, settled_at ASC, record_id ASC, user_id ASC
                """, (rows, index) -> new Candidate(rows.getString("record_id"),
                rows.getLong("user_id"), rows.getString("nickname"), rows.getLong("score"),
                rows.getTimestamp("settled_at").toInstant(), rows.getLong("max_combo")),
                Timestamp.from(startsAt), Timestamp.from(endsAt), BungeoppangV5Spec.RULES_VERSION,
                BungeoppangV5Spec.DURATION_MS * 1_000L);
    }

    private List<Candidate> jumpmapCandidates(Instant startsAt, Instant endsAt) {
        String sql = """
                WITH eligible AS (
                    SELECT r.id AS record_id, r.user_id, r.finish_ms, r.ended_at
                    FROM jump_runs r JOIN users u ON u.id = r.user_id
                    WHERE r.status = 'ENDED' AND r.end_reason = 'FINISH'
                      AND %s AND r.finish_ms > 0
                      AND r.final_reached = TRUE AND r.gates_passed = ?
                      AND r.rules_version = ? AND r.course_version = ?
                      AND r.ended_at >= ? AND r.ended_at < ?
                      AND u.deleted_at IS NULL
                ), choices AS (
                    SELECT eligible.*,
                           ROW_NUMBER() OVER (PARTITION BY user_id
                               ORDER BY finish_ms ASC, ended_at ASC, record_id ASC) AS choice
                    FROM eligible
                )
                SELECT choices.record_id, choices.user_id, u.nickname, finish_ms, ended_at
                FROM choices JOIN users u ON u.id = choices.user_id WHERE choice = 1
                ORDER BY finish_ms ASC, ended_at ASC, record_id ASC, user_id ASC
                """.formatted(JumpmapRankingEligibility.SQL);
        return jdbc.query(sql, (rows, index) -> new Candidate(rows.getString("record_id"),
                rows.getLong("user_id"), rows.getString("nickname"), rows.getLong("finish_ms"),
                rows.getTimestamp("ended_at").toInstant(), 0),
                JumpCourse.STAGES, JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION,
                Timestamp.from(startsAt), Timestamp.from(endsAt));
    }

    public void insertWinner(long roundId, long slotId, Candidate candidate, Instant selectedAt) {
        jdbc.update("""
                INSERT INTO event_winners(event_round_id, prize_slot_id, user_id,
                    source_record_id, source_value, source_achieved_at, selected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, roundId, slotId, candidate.userId(), candidate.recordId(),
                candidate.sourceValue(), Timestamp.from(candidate.achievedAt()), Timestamp.from(selectedAt));
    }

    public Optional<Winner> winner(long roundId) {
        return jdbc.query("""
                SELECT w.user_id, u.nickname, w.source_record_id, w.source_value,
                       w.source_achieved_at, w.selected_at, s.prize_name
                FROM event_winners w JOIN event_prize_slots s ON s.id = w.prize_slot_id
                JOIN users u ON u.id = w.user_id
                WHERE w.event_round_id = ?
                """, (rows, index) -> new Winner(rows.getLong("user_id"), rows.getString("nickname"),
                rows.getString("source_record_id"), rows.getLong("source_value"),
                rows.getTimestamp("source_achieved_at").toInstant(),
                rows.getTimestamp("selected_at").toInstant(), rows.getString("prize_name")),
                roundId).stream().findFirst();
    }

    public void finalizeRound(long roundId, Instant now, Long administratorUserId) {
        jdbc.update("""
                UPDATE event_rounds SET finalized_at = ?, finalization_source = ?, finalized_by_user_id = ?
                WHERE id = ? AND finalized_at IS NULL
                """, Timestamp.from(now), administratorUserId == null ? "AUTO" : "ADMIN",
                administratorUserId, roundId);
    }

    public void insertAttempt(long roundId, Long administratorUserId, String outcome,
            Integer candidateCount, Integer excludedGmCount, Integer winnerCount, Instant now) {
        jdbc.update("""
                INSERT INTO event_finalization_attempts(event_round_id, trigger_source,
                    administrator_user_id, outcome, candidate_count, excluded_gm_count,
                    winner_count, error_code, attempted_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, roundId, administratorUserId == null ? "AUTO" : "ADMIN",
                administratorUserId, outcome, candidateCount, excludedGmCount, winnerCount,
                "FAILED".equals(outcome) ? "EVENT_FINALIZATION_FAILED" : null,
                Timestamp.from(now), Timestamp.from(now));
    }

    public Optional<OutcomeCounts> successfulCounts(long roundId) {
        return jdbc.query("""
                SELECT candidate_count, excluded_gm_count
                FROM event_finalization_attempts
                WHERE event_round_id = ? AND outcome = 'SUCCEEDED'
                ORDER BY id DESC LIMIT 1
                """, (rows, index) -> new OutcomeCounts(rows.getInt("candidate_count"),
                rows.getInt("excluded_gm_count")), roundId).stream().findFirst();
    }

    private Round round(ResultSet rows) throws SQLException {
        Timestamp finalizedAt = rows.getTimestamp("finalized_at");
        return new Round(rows.getLong("id"), rows.getDate("week_start_date").toLocalDate(),
                rows.getTimestamp("starts_at").toInstant(), rows.getTimestamp("ends_at").toInstant(),
                rows.getTimestamp("announces_at").toInstant(),
                finalizedAt == null ? null : finalizedAt.toInstant());
    }

    public record Round(long id, LocalDate weekStartDate, Instant startsAt, Instant endsAt,
            Instant announcesAt, Instant finalizedAt) {}
    public record Slot(long id, int place, int slotNumber, String prizeName) {}
    public record Candidate(String recordId, long userId, String nickname, long sourceValue,
            Instant achievedAt, long secondaryValue) {}
    public record OutcomeCounts(int candidateCount, int excludedGmCount) {}
}
