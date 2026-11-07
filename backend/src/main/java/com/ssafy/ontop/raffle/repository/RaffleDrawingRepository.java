package com.ssafy.ontop.raffle.repository;

import com.ssafy.ontop.raffle.domain.RaffleDrawSelector.Ticket;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse.Winner;
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

public class RaffleDrawingRepository {
    private final JdbcTemplate jdbc;

    public RaffleDrawingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<LocalDate> dueWeeks(Instant now, LocalDate firstWeek) {
        return jdbc.query("""
                SELECT r.week_start_date
                FROM raffle_rounds r
                LEFT JOIN event_rounds e ON e.raffle_round_id = r.id AND e.event_type = 'RAFFLE'
                WHERE r.sales_ends_at <= ? AND r.week_start_date >= ?
                  AND (e.id IS NULL OR e.finalized_at IS NULL)
                ORDER BY r.week_start_date
                LIMIT 24
                """, (rows, index) -> rows.getDate(1).toLocalDate(),
                Timestamp.from(now), java.sql.Date.valueOf(firstWeek));
    }

    public void closeSales(long raffleRoundId, Instant now) {
        jdbc.update("""
                UPDATE raffle_rounds SET sales_status = 'CLOSED'
                WHERE id = ? AND sales_ends_at <= ?
                """, raffleRoundId, Timestamp.from(now));
    }

    public void ensureEventRound(long raffleRoundId, LocalDate week, Instant startsAt,
            Instant endsAt, Instant announcesAt) {
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at,
                    announces_at, raffle_round_id)
                VALUES ('RAFFLE', ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """, java.sql.Date.valueOf(week), Timestamp.from(startsAt), Timestamp.from(endsAt),
                Timestamp.from(announcesAt), raffleRoundId);
    }

    public Optional<EventRound> round(LocalDate week, boolean locked) {
        String sql = """
                SELECT id, raffle_round_id, week_start_date, starts_at, ends_at,
                       announces_at, finalized_at
                FROM event_rounds WHERE event_type = 'RAFFLE' AND week_start_date = ?
                """ + (locked ? " FOR UPDATE" : "");
        return jdbc.query(sql, (rows, index) -> eventRound(rows),
                java.sql.Date.valueOf(week)).stream().findFirst();
    }

    public void ensurePrizeSlot(long eventRoundId, int place, int slotNumber, String prizeName) {
        jdbc.update("""
                INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """, eventRoundId, place, slotNumber, prizeName);
    }

    public List<PrizeSlot> prizeSlots(long eventRoundId) {
        return jdbc.query("""
                SELECT id, place, slot_number, prize_name FROM event_prize_slots
                WHERE event_round_id = ? ORDER BY place, slot_number
                """, (rows, index) -> new PrizeSlot(rows.getLong("id"), rows.getInt("place"),
                rows.getInt("slot_number"), rows.getString("prize_name")), eventRoundId);
    }

    public List<Ticket> purchasedTickets(long raffleRoundId, Instant startsAt, Instant endsAt) {
        return jdbc.query("""
                SELECT t.id, t.user_id, t.ticket_number
                FROM raffle_tickets t
                JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
                WHERE t.round_id = ? AND t.purchased_at >= ? AND t.purchased_at < ?
                ORDER BY t.id
                """, (rows, index) -> new Ticket(rows.getLong("id"), rows.getLong("user_id"),
                rows.getInt("ticket_number")), raffleRoundId, Timestamp.from(startsAt),
                Timestamp.from(endsAt));
    }

    public void insertWinner(long eventRoundId, long slotId, Ticket ticket, Instant selectedAt) {
        jdbc.update("""
                INSERT INTO event_winners(event_round_id, prize_slot_id, user_id,
                    raffle_ticket_id, selected_at)
                VALUES (?, ?, ?, ?, ?)
                """, eventRoundId, slotId, ticket.userId(), ticket.id(), Timestamp.from(selectedAt));
    }

    public List<Winner> winners(long eventRoundId) {
        return jdbc.query("""
                SELECT w.user_id, w.raffle_ticket_id, t.ticket_number,
                       s.place, s.slot_number, s.prize_name
                FROM event_winners w
                JOIN event_prize_slots s ON s.id = w.prize_slot_id
                JOIN raffle_tickets t ON t.id = w.raffle_ticket_id
                WHERE w.event_round_id = ?
                ORDER BY s.place, s.slot_number
                """, (rows, index) -> new Winner(rows.getLong("user_id"),
                rows.getLong("raffle_ticket_id"), rows.getInt("ticket_number"),
                rows.getInt("place"), rows.getInt("slot_number"),
                rows.getString("prize_name")), eventRoundId);
    }

    public void finalizeRound(long eventRoundId, Instant now, Long administratorUserId) {
        jdbc.update("""
                UPDATE event_rounds SET finalized_at = ?, finalization_source = ?,
                    finalized_by_user_id = ?
                WHERE id = ? AND finalized_at IS NULL
                """, Timestamp.from(now), administratorUserId == null ? "AUTO" : "ADMIN",
                administratorUserId, eventRoundId);
    }

    public long insertAttempt(long eventRoundId, Long administratorUserId, Instant now,
            String outcome, Instant completedAt) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO event_finalization_attempts(
                        event_round_id, trigger_source, administrator_user_id,
                        outcome, attempted_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, eventRoundId);
            statement.setString(2, administratorUserId == null ? "AUTO" : "ADMIN");
            if (administratorUserId == null) {
                statement.setNull(3, java.sql.Types.BIGINT);
            } else {
                statement.setLong(3, administratorUserId);
            }
            statement.setString(4, outcome);
            statement.setTimestamp(5, Timestamp.from(now));
            if (completedAt == null) {
                statement.setNull(6, java.sql.Types.TIMESTAMP);
            } else {
                statement.setTimestamp(6, Timestamp.from(completedAt));
            }
            return statement;
        }, key);
        return key.getKey().longValue();
    }

    public void completeAttempt(long attemptId, int candidateCount, int excludedGmCount,
            int winnerCount, Instant now) {
        jdbc.update("""
                UPDATE event_finalization_attempts
                SET outcome = 'SUCCEEDED', candidate_count = ?,
                    excluded_gm_count = ?, winner_count = ?, completed_at = ?
                WHERE id = ?
                """, candidateCount, excludedGmCount, winnerCount, Timestamp.from(now), attemptId);
    }

    public Optional<OutcomeCounts> successfulCounts(long eventRoundId) {
        return jdbc.query("""
                SELECT candidate_count, excluded_gm_count FROM event_finalization_attempts
                WHERE event_round_id = ? AND outcome = 'SUCCEEDED'
                  AND candidate_count IS NOT NULL AND excluded_gm_count IS NOT NULL
                ORDER BY id DESC LIMIT 1
                """, (rows, index) -> new OutcomeCounts(rows.getInt("candidate_count"),
                rows.getInt("excluded_gm_count")), eventRoundId).stream().findFirst();
    }

    public void insertFailedAttempt(long eventRoundId, Long administratorUserId, Instant now) {
        jdbc.update("""
                INSERT INTO event_finalization_attempts(
                    event_round_id, trigger_source, administrator_user_id,
                    outcome, error_code, attempted_at, completed_at)
                VALUES (?, ?, ?, 'FAILED', 'DRAW_FAILED', ?, ?)
                """, eventRoundId, administratorUserId == null ? "AUTO" : "ADMIN",
                administratorUserId, Timestamp.from(now), Timestamp.from(now));
    }

    public record OutcomeCounts(int candidateCount, int excludedGmCount) {}

    private EventRound eventRound(ResultSet rows) throws SQLException {
        Timestamp finalizedAt = rows.getTimestamp("finalized_at");
        return new EventRound(rows.getLong("id"), rows.getLong("raffle_round_id"),
                rows.getDate("week_start_date").toLocalDate(),
                rows.getTimestamp("starts_at").toInstant(),
                rows.getTimestamp("ends_at").toInstant(),
                rows.getTimestamp("announces_at").toInstant(),
                finalizedAt == null ? null : finalizedAt.toInstant());
    }

    public record EventRound(long id, long raffleRoundId, LocalDate weekStartDate,
            Instant startsAt, Instant endsAt, Instant announcesAt, Instant finalizedAt) {}

    public record PrizeSlot(long id, int place, int slotNumber, String prizeName) {}
}
