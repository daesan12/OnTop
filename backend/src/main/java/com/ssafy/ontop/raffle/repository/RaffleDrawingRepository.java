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

    /**
     * 주차가 공개 추첨 행사 회차이거나 행사에 포함된 회차인지 확인한다. 진행 상태와 관계없이 소속 자체가
     * 직접 확정 잠금의 근거다. 연결 실패(회차 없음·이미 확정)와 행사 회차 연결 누락은 미완료로 센다.
     */
    public Optional<LiveEventMembership> liveEventMembership(LocalDate week) {
        var date = java.sql.Date.valueOf(week);
        return jdbc.query("""
                SELECT e.id AS live_event_id, p.week_start_date AS event_week,
                       (SELECT COUNT(*) FROM raffle_live_event_rounds x
                        WHERE x.live_event_id = e.id AND x.raffle_round_id IS NULL)
                     + (CASE WHEN EXISTS (SELECT 1 FROM raffle_live_event_rounds x
                        WHERE x.live_event_id = e.id AND x.raffle_round_id = e.raffle_round_id) THEN 0 ELSE 1 END)
                       AS missing_rounds,
                       (SELECT COUNT(*) FROM raffle_live_event_rounds x
                        JOIN event_rounds f ON f.event_type = 'RAFFLE' AND f.raffle_round_id = x.raffle_round_id
                        WHERE x.live_event_id = e.id AND x.raffle_round_id <> e.raffle_round_id
                          AND f.finalized_at IS NOT NULL) AS finalized_rounds
                FROM raffle_live_events e
                JOIN raffle_rounds p ON p.id = e.raffle_round_id
                WHERE p.week_start_date = ? OR EXISTS (SELECT 1 FROM raffle_live_event_rounds l
                    WHERE l.live_event_id = e.id AND l.week_start_date = ?)
                """, (rows, index) -> new LiveEventMembership(rows.getLong("live_event_id"),
                rows.getDate("event_week").toLocalDate(), rows.getInt("missing_rounds"),
                rows.getInt("finalized_rounds")), date, date).stream().findFirst();
    }

    /** 행사에 연결된 모든 회차의 응모권을 각 회차의 판매 기간 안에서만 모은다. 연결되지 않은 회차는 포함하지 않는다. */
    public List<Ticket> liveEventTickets(long liveEventId) {
        return jdbc.query("""
                SELECT t.id, t.user_id, t.ticket_number
                FROM raffle_live_event_rounds l
                JOIN raffle_rounds r ON r.id = l.raffle_round_id
                JOIN raffle_tickets t ON t.round_id = r.id
                JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
                WHERE l.live_event_id = ? AND t.purchased_at >= r.sales_starts_at
                  AND t.purchased_at < r.sales_ends_at
                ORDER BY t.id
                """, (rows, index) -> new Ticket(rows.getLong("id"), rows.getLong("user_id"),
                rows.getInt("ticket_number")), liveEventId);
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

    public Optional<ReviewDraw> currentReview(long eventRoundId) {
        return jdbc.query("""
                SELECT id, event_round_id, raffle_round_id, attempt_number, status,
                       requested_by_user_id, reroll_reason, candidate_count,
                       excluded_gm_count, picked_count, created_at
                FROM event_raffle_draws
                WHERE event_round_id = ? AND status = 'REVIEW'
                """, (rows, index) -> reviewDraw(rows), eventRoundId).stream().findFirst();
    }

    public Optional<ReviewDraw> confirmedReview(long eventRoundId) {
        return jdbc.query("""
                SELECT id, event_round_id, raffle_round_id, attempt_number, status,
                       requested_by_user_id, reroll_reason, candidate_count,
                       excluded_gm_count, picked_count, created_at
                FROM event_raffle_draws
                WHERE event_round_id = ? AND status = 'CONFIRMED'
                """, (rows, index) -> reviewDraw(rows), eventRoundId).stream().findFirst();
    }

    public int lastReviewNumber(long eventRoundId) {
        Integer number = jdbc.queryForObject("""
                SELECT COALESCE(MAX(attempt_number), 0) FROM event_raffle_draws
                WHERE event_round_id = ?
                """, Integer.class, eventRoundId);
        return number == null ? 0 : number;
    }

    public long insertReview(long eventRoundId, long raffleRoundId, int attemptNumber,
            long administratorUserId, String rerollReason, int candidateCount,
            int excludedGmCount, int pickedCount, Instant now) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO event_raffle_draws(event_round_id, raffle_round_id,
                        attempt_number, status, requested_by_user_id, reroll_reason,
                        candidate_count, excluded_gm_count, picked_count, created_at)
                    VALUES (?, ?, ?, 'REVIEW', ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, eventRoundId);
            statement.setLong(2, raffleRoundId);
            statement.setInt(3, attemptNumber);
            statement.setLong(4, administratorUserId);
            statement.setString(5, rerollReason);
            statement.setInt(6, candidateCount);
            statement.setInt(7, excludedGmCount);
            statement.setInt(8, pickedCount);
            statement.setTimestamp(9, Timestamp.from(now));
            return statement;
        }, key);
        return key.getKey().longValue();
    }

    public void insertReviewPick(long drawId, long eventRoundId, long raffleRoundId,
            long slotId, Ticket ticket) {
        jdbc.update("""
                INSERT INTO event_raffle_draw_picks(draw_id, event_round_id, raffle_round_id,
                    prize_slot_id, raffle_ticket_id, user_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """, drawId, eventRoundId, raffleRoundId, slotId, ticket.id(), ticket.userId());
    }

    public List<ReviewPick> reviewPicks(long drawId) {
        return jdbc.query("""
                SELECT p.prize_slot_id, p.raffle_ticket_id, p.user_id, u.nickname, t.ticket_number,
                       s.place, s.slot_number, s.prize_name
                FROM event_raffle_draw_picks p
                JOIN raffle_tickets t ON t.id = p.raffle_ticket_id
                JOIN users u ON u.id = p.user_id
                JOIN event_prize_slots s ON s.id = p.prize_slot_id
                WHERE p.draw_id = ? ORDER BY s.place, s.slot_number
                """, (rows, index) -> new ReviewPick(rows.getLong("prize_slot_id"),
                new Ticket(rows.getLong("raffle_ticket_id"), rows.getLong("user_id"),
                        rows.getInt("ticket_number")), rows.getString("nickname"), rows.getInt("place"),
                rows.getInt("slot_number"), rows.getString("prize_name")), drawId);
    }

    public int supersedeReview(long drawId, Instant now) {
        return jdbc.update("""
                UPDATE event_raffle_draws SET status = 'SUPERSEDED', superseded_at = ?
                WHERE id = ? AND status = 'REVIEW'
                """, Timestamp.from(now), drawId);
    }

    public int confirmReview(long drawId, Instant now) {
        return jdbc.update("""
                UPDATE event_raffle_draws SET status = 'CONFIRMED', confirmed_at = ?
                WHERE id = ? AND status = 'REVIEW'
                """, Timestamp.from(now), drawId);
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
                SELECT w.user_id, u.nickname, w.raffle_ticket_id, t.ticket_number,
                       s.place, s.slot_number, s.prize_name
                FROM event_winners w
                JOIN event_prize_slots s ON s.id = w.prize_slot_id
                JOIN raffle_tickets t ON t.id = w.raffle_ticket_id
                JOIN users u ON u.id = w.user_id
                WHERE w.event_round_id = ?
                ORDER BY s.place, s.slot_number
                """, (rows, index) -> new Winner(rows.getLong("user_id"), rows.getString("nickname"),
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

    /** 행사 소속 정보. eventWeek는 추첨·확정을 진행하는 행사 회차(11/16)다. */
    public record LiveEventMembership(long liveEventId, LocalDate eventWeek, int missingRounds,
            int finalizedRounds) {
        public boolean eventRound(LocalDate week) {
            return eventWeek.equals(week);
        }

        public boolean complete() {
            return missingRounds == 0 && finalizedRounds == 0;
        }
    }

    public record ReviewDraw(long id, long eventRoundId, long raffleRoundId,
            int attemptNumber, String status, long requestedByUserId, String rerollReason,
            int candidateCount, int excludedGmCount, int pickedCount, Instant createdAt) {}

    public record ReviewPick(long slotId, Ticket ticket, String nickname, int place, int slotNumber,
            String prizeName) {
        public Winner winner() {
            return new Winner(ticket.userId(), nickname, ticket.id(), ticket.number(), place,
                    slotNumber, prizeName);
        }
    }

    private ReviewDraw reviewDraw(ResultSet rows) throws SQLException {
        return new ReviewDraw(rows.getLong("id"), rows.getLong("event_round_id"),
                rows.getLong("raffle_round_id"), rows.getInt("attempt_number"),
                rows.getString("status"), rows.getLong("requested_by_user_id"),
                rows.getString("reroll_reason"), rows.getInt("candidate_count"),
                rows.getInt("excluded_gm_count"), rows.getInt("picked_count"),
                rows.getTimestamp("created_at").toInstant());
    }

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
