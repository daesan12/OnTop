package com.ssafy.ontop.raffle.repository;

import com.ssafy.ontop.raffle.domain.RaffleRound;
import com.ssafy.ontop.raffle.domain.RaffleSaleWindow;
import com.ssafy.ontop.raffle.domain.RaffleTicket;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;

public class RaffleRepository {
    private final JdbcTemplate jdbc;

    public RaffleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void synchronizeRound(RaffleSaleWindow window, Instant now) {
        jdbc.update("""
                INSERT INTO raffle_rounds(
                    week_start_date, sales_starts_at, sales_ends_at, sales_status
                ) VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE sales_status = CASE
                    WHEN sales_ends_at <= ? THEN 'CLOSED'
                    WHEN sales_status = 'SCHEDULED' AND sales_starts_at <= ? AND sales_ends_at > ? THEN 'OPEN'
                    ELSE sales_status
                END
                """, Date.valueOf(window.weekStartDate()), Timestamp.from(window.salesStartsAt()),
                Timestamp.from(window.salesEndsAt()), window.salesStatus(), Timestamp.from(now),
                Timestamp.from(now), Timestamp.from(now));
        jdbc.update("""
                UPDATE raffle_rounds
                SET sales_status = 'CLOSED'
                WHERE sales_status <> 'CLOSED' AND sales_ends_at <= ?
                """, Timestamp.from(now));
    }

    public Optional<RaffleRound> round(LocalDate weekStartDate) {
        return jdbc.query("""
                SELECT id, week_start_date, sales_starts_at, sales_ends_at,
                       ticket_price, weekly_ticket_limit, sales_status
                FROM raffle_rounds
                WHERE week_start_date = ?
                """, (rows, index) -> round(rows), Date.valueOf(weekStartDate)).stream().findFirst();
    }

    public Optional<RaffleRound> lockRound(LocalDate weekStartDate) {
        return jdbc.query("""
                SELECT id, week_start_date, sales_starts_at, sales_ends_at,
                       ticket_price, weekly_ticket_limit, sales_status
                FROM raffle_rounds
                WHERE week_start_date = ?
                FOR UPDATE
                """, (rows, index) -> round(rows), Date.valueOf(weekStartDate)).stream().findFirst();
    }

    public Optional<RaffleTicket> ticket(long roundId, long userId, String idempotencyKey) {
        return jdbc.query("""
                SELECT id, round_id, user_id, ticket_number, purchase_price, balance_after,
                       wallet_transaction_id, idempotency_key, purchased_at
                FROM raffle_tickets
                WHERE round_id = ? AND user_id = ? AND idempotency_key = ?
                """, (rows, index) -> ticket(rows), roundId, userId, idempotencyKey).stream().findFirst();
    }

    public List<RaffleTicket> tickets(long roundId, long userId) {
        return jdbc.query("""
                SELECT id, round_id, user_id, ticket_number, purchase_price, balance_after,
                       wallet_transaction_id, idempotency_key, purchased_at
                FROM raffle_tickets
                WHERE round_id = ? AND user_id = ?
                ORDER BY purchased_at, id
                """, (rows, index) -> ticket(rows), roundId, userId);
    }

    public int ticketCount(long roundId, long userId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM raffle_tickets WHERE round_id = ? AND user_id = ?",
                Integer.class, roundId, userId);
        return count == null ? 0 : count;
    }

    public Set<Integer> usedNumbers(long roundId) {
        return new HashSet<>(jdbc.queryForList(
                "SELECT ticket_number FROM raffle_tickets WHERE round_id = ? ORDER BY ticket_number",
                Integer.class, roundId));
    }

    public long insertTicket(long roundId, long userId, int ticketNumber, long purchasePrice,
            long balanceAfter, long walletTransactionId, String idempotencyKey, Instant purchasedAt) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO raffle_tickets(
                        round_id, user_id, ticket_number, purchase_price, balance_after,
                        wallet_transaction_id, idempotency_key, purchased_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, roundId);
            statement.setLong(2, userId);
            statement.setInt(3, ticketNumber);
            statement.setLong(4, purchasePrice);
            statement.setLong(5, balanceAfter);
            statement.setLong(6, walletTransactionId);
            statement.setString(7, idempotencyKey);
            statement.setTimestamp(8, Timestamp.from(purchasedAt));
            return statement;
        }, key);
        Number id = key.getKey();
        if (id == null) {
            throw new IllegalStateException("저장된 응모권 ID를 확인할 수 없습니다.");
        }
        return id.longValue();
    }

    private RaffleRound round(java.sql.ResultSet rows) throws java.sql.SQLException {
        return new RaffleRound(rows.getLong("id"), rows.getDate("week_start_date").toLocalDate(),
                rows.getTimestamp("sales_starts_at").toInstant(), rows.getTimestamp("sales_ends_at").toInstant(),
                rows.getLong("ticket_price"), rows.getInt("weekly_ticket_limit"), rows.getString("sales_status"));
    }

    private RaffleTicket ticket(java.sql.ResultSet rows) throws java.sql.SQLException {
        return new RaffleTicket(rows.getLong("id"), rows.getLong("round_id"), rows.getLong("user_id"),
                rows.getInt("ticket_number"), rows.getLong("purchase_price"), rows.getLong("balance_after"),
                rows.getLong("wallet_transaction_id"), rows.getString("idempotency_key"),
                rows.getTimestamp("purchased_at").toInstant());
    }
}
