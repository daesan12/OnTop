package com.ssafy.ontop.notification.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/** Connects already-published awards to one private inbox item per member and week. */
public final class EventWinnerNotificationRepository {
    private final JdbcTemplate jdbc;

    public EventWinnerNotificationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void connectPublished(long userId, Instant now) {
        jdbc.update("""
                INSERT INTO personal_notifications(user_id, reply_id, type, title, created_at,
                    expires_at, event_week_start_date)
                SELECT ?, NULL, 'EVENT_WINNER', '행사 당첨 결과가 발표됐어요',
                       MIN(GREATEST(r.announces_at, r.finalized_at)),
                       DATE_ADD(MAX(GREATEST(r.announces_at, r.finalized_at)), INTERVAL 90 DAY),
                       r.week_start_date
                FROM event_winners w
                JOIN event_rounds r ON r.id = w.event_round_id
                WHERE w.user_id = ? AND r.finalized_at IS NOT NULL
                  AND r.announces_at <= ? AND r.finalized_at <= ?
                GROUP BY r.week_start_date
                HAVING DATE_ADD(MAX(GREATEST(r.announces_at, r.finalized_at)), INTERVAL 90 DAY) > ?
                ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, VALUES(expires_at))
                """, userId, userId, Timestamp.from(now), Timestamp.from(now), Timestamp.from(now));
    }

    public List<Award> publishedAwards(long userId, LocalDate week, Instant now) {
        return jdbc.query("""
                SELECT w.id AS winner_id, r.event_type, s.place, s.prize_name,
                       GREATEST(r.announces_at, r.finalized_at) AS published_at,
                       d.delivered_at, receipt.first_submitted_at, receipt.last_updated_at,
                       c.expires_at AS contact_expires_at
                FROM event_winners w
                JOIN event_rounds r ON r.id = w.event_round_id
                JOIN event_prize_slots s ON s.id = w.prize_slot_id
                LEFT JOIN event_prize_deliveries d ON d.winner_id = w.id
                LEFT JOIN event_contact_receipts receipt
                    ON receipt.user_id = w.user_id AND receipt.week_start_date = r.week_start_date
                LEFT JOIN event_winner_contacts c
                    ON c.user_id = w.user_id AND c.week_start_date = r.week_start_date
                    AND c.expires_at > ?
                WHERE w.user_id = ? AND r.week_start_date = ?
                  AND r.finalized_at IS NOT NULL AND r.announces_at <= ? AND r.finalized_at <= ?
                ORDER BY r.event_type, s.place, s.slot_number, w.id
                """, (rows, index) -> {
            Timestamp delivered = rows.getTimestamp("delivered_at");
            Timestamp submitted = rows.getTimestamp("first_submitted_at");
            Timestamp updated = rows.getTimestamp("last_updated_at");
            Timestamp contactExpiry = rows.getTimestamp("contact_expires_at");
            return new Award(rows.getLong("winner_id"), rows.getString("event_type"),
                    rows.getInt("place"), rows.getString("prize_name"),
                    rows.getTimestamp("published_at").toInstant(),
                    delivered == null ? null : delivered.toInstant(), submitted != null,
                    submitted != null && updated != null && updated.after(submitted),
                    contactExpiry == null ? null : contactExpiry.toInstant());
        }, Timestamp.from(now), userId, java.sql.Date.valueOf(week),
                Timestamp.from(now), Timestamp.from(now));
    }

    public record Award(long winnerId, String eventType, int place, String prizeName,
            Instant publishedAt, Instant deliveredAt, boolean contactSubmitted, boolean contactEdited,
            Instant contactExpiresAt) {}
}
