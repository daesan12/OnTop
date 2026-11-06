package com.ssafy.ontop.event.contact;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

public final class WinnerContactRepository {
    private final JdbcTemplate jdbc;

    public WinnerContactRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean lockActiveUser(long userId) {
        return !jdbc.query("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
                (rows, index) -> rows.getLong(1), userId).isEmpty();
    }

    public Optional<Instant> latestAnnouncement(long userId, LocalDate week, Instant now) {
        return jdbc.query("""
                SELECT MAX(GREATEST(r.announces_at, r.finalized_at))
                FROM event_winners w
                JOIN event_rounds r ON r.id = w.event_round_id
                WHERE w.user_id = ? AND r.week_start_date = ?
                  AND r.finalized_at IS NOT NULL
                  AND r.announces_at <= ? AND r.finalized_at <= ?
                """, rows -> {
            rows.next();
            Timestamp value = rows.getTimestamp(1);
            return Optional.ofNullable(value).map(Timestamp::toInstant);
        }, userId, java.sql.Date.valueOf(week), Timestamp.from(now), Timestamp.from(now));
    }

    public List<AwardRow> ownAwards(long userId, LocalDate week, Instant now) {
        String sql = """
                SELECT w.id AS winner_id, w.user_id, r.week_start_date, r.event_type,
                       s.place, s.prize_name, r.announces_at, r.finalized_at,
                       c.phone_last_four, c.expires_at AS contact_expires_at,
                       receipt.first_submitted_at
                FROM event_winners w
                JOIN event_rounds r ON r.id = w.event_round_id
                JOIN event_prize_slots s ON s.id = w.prize_slot_id
                LEFT JOIN event_contact_receipts receipt
                    ON receipt.user_id = w.user_id AND receipt.week_start_date = r.week_start_date
                LEFT JOIN event_winner_contacts c
                    ON c.user_id = w.user_id AND c.week_start_date = r.week_start_date
                    AND c.expires_at > ?
                WHERE w.user_id = ? AND r.finalized_at IS NOT NULL
                  AND r.announces_at <= ? AND r.finalized_at <= ?
                """ + (week == null ? "" : " AND r.week_start_date = ?") + """
                ORDER BY r.week_start_date DESC, r.event_type, s.place, w.id
                LIMIT 100
                """;
        List<Object> args = new ArrayList<>(List.of(Timestamp.from(now), userId,
                Timestamp.from(now), Timestamp.from(now)));
        if (week != null) {
            args.add(java.sql.Date.valueOf(week));
        }
        return jdbc.query(sql, (rows, index) -> award(rows), args.toArray());
    }

    public List<AwardRow> adminAwards(LocalDate week, String type, String status,
            Instant now, int limit, int offset) {
        String sql = """
                SELECT w.id AS winner_id, w.user_id, r.week_start_date, r.event_type,
                       s.place, s.prize_name, r.announces_at, r.finalized_at,
                       c.phone_last_four, c.expires_at AS contact_expires_at,
                       receipt.first_submitted_at
                FROM event_winners w
                JOIN event_rounds r ON r.id = w.event_round_id
                JOIN event_prize_slots s ON s.id = w.prize_slot_id
                LEFT JOIN event_contact_receipts receipt
                    ON receipt.user_id = w.user_id AND receipt.week_start_date = r.week_start_date
                LEFT JOIN event_winner_contacts c
                    ON c.user_id = w.user_id AND c.week_start_date = r.week_start_date
                    AND c.expires_at > ?
                WHERE r.finalized_at IS NOT NULL AND r.announces_at <= ? AND r.finalized_at <= ?
                """;
        List<Object> args = new ArrayList<>(List.of(Timestamp.from(now), Timestamp.from(now),
                Timestamp.from(now)));
        if (week != null) {
            sql += " AND r.week_start_date = ?";
            args.add(java.sql.Date.valueOf(week));
        }
        if (type != null) {
            sql += " AND r.event_type = ?";
            args.add(type);
        }
        if (status != null) {
            sql += switch (status) {
                case "NOT_SUBMITTED" -> " AND receipt.user_id IS NULL";
                case "SUBMITTED" -> " AND c.user_id IS NOT NULL";
                case "EXPIRED" -> " AND receipt.user_id IS NOT NULL AND c.user_id IS NULL";
                default -> throw new IllegalArgumentException("알 수 없는 연락처 상태입니다.");
            };
        }
        sql += " ORDER BY r.week_start_date DESC, r.event_type, s.place, w.id LIMIT ? OFFSET ?";
        args.add(limit);
        args.add(offset);
        return jdbc.query(sql, (rows, index) -> award(rows), args.toArray());
    }

    public Optional<AwardContact> awardContact(long winnerId, Instant now) {
        return jdbc.query("""
                SELECT w.id AS winner_id, w.user_id, r.week_start_date,
                       c.encrypted_phone, c.encryption_key_id, c.expires_at
                FROM event_winners w
                JOIN event_rounds r ON r.id = w.event_round_id
                LEFT JOIN event_winner_contacts c
                    ON c.user_id = w.user_id AND c.week_start_date = r.week_start_date
                    AND c.expires_at > ?
                WHERE w.id = ? AND r.finalized_at IS NOT NULL
                  AND r.announces_at <= ? AND r.finalized_at <= ?
                """, (rows, index) -> {
            Timestamp expiry = rows.getTimestamp("expires_at");
            return new AwardContact(rows.getLong("winner_id"), rows.getLong("user_id"),
                    rows.getDate("week_start_date").toLocalDate(),
                    rows.getBytes("encrypted_phone"), rows.getString("encryption_key_id"),
                    expiry == null ? null : expiry.toInstant());
        }, Timestamp.from(now), winnerId, Timestamp.from(now), Timestamp.from(now))
                .stream().findFirst();
    }

    public Optional<Contact> contact(long userId, LocalDate week) {
        return jdbc.query("""
                SELECT encrypted_phone, encryption_key_id, phone_last_four, expires_at
                FROM event_winner_contacts WHERE user_id = ? AND week_start_date = ?
                """, (rows, index) -> new Contact(rows.getBytes("encrypted_phone"),
                rows.getString("encryption_key_id"), rows.getString("phone_last_four"),
                rows.getTimestamp("expires_at").toInstant()), userId, java.sql.Date.valueOf(week))
                .stream().findFirst();
    }

    public Optional<Receipt> receipt(long userId, LocalDate week) {
        return jdbc.query("""
                SELECT first_submitted_at, expires_at FROM event_contact_receipts
                WHERE user_id = ? AND week_start_date = ?
                """, (rows, index) -> new Receipt(rows.getTimestamp("first_submitted_at").toInstant(),
                rows.getTimestamp("expires_at").toInstant()), userId, java.sql.Date.valueOf(week))
                .stream().findFirst();
    }

    public void insertReceipt(long userId, LocalDate week, Instant now, Instant expiresAt) {
        jdbc.update("""
                INSERT INTO event_contact_receipts(user_id, week_start_date,
                    first_submitted_at, expires_at, last_updated_at) VALUES (?, ?, ?, ?, ?)
                """, userId, java.sql.Date.valueOf(week), Timestamp.from(now),
                Timestamp.from(expiresAt), Timestamp.from(now));
    }

    public void touchReceipt(long userId, LocalDate week, Instant now) {
        jdbc.update("""
                UPDATE event_contact_receipts SET last_updated_at = ?
                WHERE user_id = ? AND week_start_date = ?
                """, Timestamp.from(now), userId, java.sql.Date.valueOf(week));
    }

    public void saveContact(long userId, LocalDate week, byte[] encrypted, String keyId,
            String lastFour, Instant submittedAt, Instant expiresAt) {
        jdbc.update("""
                INSERT INTO event_winner_contacts(user_id, week_start_date, encrypted_phone,
                    encryption_key_id, phone_last_four, submitted_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE encrypted_phone = VALUES(encrypted_phone),
                    encryption_key_id = VALUES(encryption_key_id), phone_last_four = VALUES(phone_last_four)
                """, userId, java.sql.Date.valueOf(week), encrypted, keyId, lastFour,
                Timestamp.from(submittedAt), Timestamp.from(expiresAt));
    }

    public void auditReveal(long administratorId, AwardContact contact, Instant now) {
        jdbc.update("""
                INSERT INTO event_contact_access_audit(administrator_user_id, winner_id,
                    contact_user_id, week_start_date, accessed_at)
                VALUES (?, ?, ?, ?, ?)
                """, administratorId, contact.winnerId(), contact.userId(),
                java.sql.Date.valueOf(contact.week()), Timestamp.from(now));
    }

    public int deleteExpired(Instant now) {
        return jdbc.update("DELETE FROM event_winner_contacts WHERE expires_at <= ?", Timestamp.from(now));
    }

    private AwardRow award(ResultSet rows) throws SQLException {
        Timestamp submitted = rows.getTimestamp("first_submitted_at");
        Timestamp expires = rows.getTimestamp("contact_expires_at");
        return new AwardRow(rows.getLong("winner_id"), rows.getLong("user_id"),
                rows.getDate("week_start_date").toLocalDate(), rows.getString("event_type"),
                rows.getInt("place"), rows.getString("prize_name"),
                rows.getTimestamp("announces_at").toInstant(),
                rows.getTimestamp("finalized_at").toInstant(),
                rows.getString("phone_last_four"), submitted == null ? null : submitted.toInstant(),
                expires == null ? null : expires.toInstant());
    }

    public record AwardRow(long winnerId, long userId, LocalDate week, String eventType,
            int place, String prizeName, Instant announcesAt, Instant finalizedAt,
            String lastFour, Instant firstSubmittedAt, Instant contactExpiresAt) {}

    public record Contact(byte[] encrypted, String keyId, String lastFour, Instant expiresAt) {}

    public record Receipt(Instant firstSubmittedAt, Instant expiresAt) {}

    public record AwardContact(long winnerId, long userId, LocalDate week, byte[] encrypted,
            String keyId, Instant expiresAt) {}
}
