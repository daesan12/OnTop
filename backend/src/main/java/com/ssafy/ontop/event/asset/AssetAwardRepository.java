package com.ssafy.ontop.event.asset;

import com.ssafy.ontop.event.asset.AssetAwardResponse.AssetWinner;
import com.ssafy.ontop.event.asset.AssetBalanceReconstruction.Change;
import com.ssafy.ontop.event.asset.AssetBalanceReconstruction.Snapshot;
import com.ssafy.ontop.event.asset.AssetBalanceReconstruction.Wallet;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

final class AssetAwardRepository {
    private final JdbcTemplate jdbc;

    AssetAwardRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void ensureRound(LocalDate week, Instant start, Instant end, Instant announcement) {
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at, announces_at)
                VALUES ('ASSET_VALUE', ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """, java.sql.Date.valueOf(week), Timestamp.from(start), Timestamp.from(end),
                Timestamp.from(announcement));
    }

    Optional<Round> round(LocalDate week, boolean lock) {
        return jdbc.query("""
                SELECT id, week_start_date, starts_at, ends_at, announces_at, finalized_at
                FROM event_rounds WHERE event_type = 'ASSET_VALUE' AND week_start_date = ?
                """ + (lock ? " FOR UPDATE" : ""), (row, index) -> new Round(row.getLong("id"),
                row.getDate("week_start_date").toLocalDate(), row.getTimestamp("starts_at").toInstant(),
                row.getTimestamp("ends_at").toInstant(), row.getTimestamp("announces_at").toInstant(),
                instant(row, "finalized_at")), java.sql.Date.valueOf(week)).stream().findFirst();
    }

    void ensureSlot(long roundId, int place, String prizeName) {
        jdbc.update("""
                INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)
                VALUES (?, ?, 1, ?)
                ON DUPLICATE KEY UPDATE id = id
                """, roundId, place, prizeName);
    }

    List<Slot> slots(long roundId) {
        return jdbc.query("""
                SELECT id, place, slot_number, prize_name FROM event_prize_slots
                WHERE event_round_id = ? ORDER BY place, slot_number
                """, (row, index) -> new Slot(row.getLong("id"), row.getInt("place"),
                row.getInt("slot_number"), row.getString("prize_name")), roundId);
    }

    List<Wallet> wallets(Instant endsAt) {
        return jdbc.query("""
                SELECT w.id AS wallet_id, w.user_id, w.balance, u.created_at
                FROM wallets w JOIN users u ON u.id = w.user_id
                WHERE u.created_at < ? AND u.deleted_at IS NULL
                ORDER BY w.id
                """, (row, index) -> new Wallet(row.getLong("wallet_id"), row.getLong("user_id"),
                row.getLong("balance"), row.getTimestamp("created_at").toInstant()),
                Timestamp.from(endsAt));
    }

    List<Change> changes(Instant startsAt, Instant endsAt) {
        return jdbc.query("""
                SELECT t.id, t.wallet_id, t.balance_delta, t.created_at
                FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
                JOIN users u ON u.id = w.user_id
                WHERE t.created_at >= ? AND u.created_at < ? AND u.deleted_at IS NULL
                ORDER BY t.wallet_id, t.created_at, t.id
                """, (row, index) -> new Change(row.getLong("id"), row.getLong("wallet_id"),
                row.getLong("balance_delta"), row.getTimestamp("created_at").toInstant()),
                Timestamp.from(startsAt), Timestamp.from(endsAt));
    }

    void insertSnapshots(long roundId, List<SnapshotEntry> entries, Instant capturedAt) {
        if (entries.isEmpty()) {
            return;
        }
        Timestamp captured = Timestamp.from(capturedAt);
        jdbc.batchUpdate("""
                INSERT INTO event_asset_snapshots(event_round_id, user_id, wallet_id, coin_balance,
                    first_reached_at, first_reached_transaction_id, excluded_gm, captured_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, entries, 500, (statement, entry) -> {
            Snapshot snapshot = entry.snapshot();
            statement.setLong(1, roundId);
            statement.setLong(2, snapshot.userId());
            statement.setLong(3, snapshot.walletId());
            statement.setLong(4, snapshot.coinBalance());
            statement.setTimestamp(5, Timestamp.from(snapshot.firstReachedAt()));
            if (snapshot.firstReachedTransactionId() == null) {
                statement.setNull(6, Types.BIGINT);
            } else {
                statement.setLong(6, snapshot.firstReachedTransactionId());
            }
            statement.setBoolean(7, entry.excludedGm());
            statement.setTimestamp(8, captured);
        });
    }

    void insertWinner(long roundId, Slot slot, Snapshot snapshot, Instant selectedAt) {
        jdbc.update("""
                INSERT INTO event_winners(event_round_id, prize_slot_id, user_id,
                    source_record_id, source_value, source_achieved_at, selected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, roundId, slot.id(), snapshot.userId(),
                snapshot.firstReachedTransactionId() == null
                        ? "wallet:" + snapshot.walletId() + ":opening"
                        : "wallet_transaction:" + snapshot.firstReachedTransactionId(),
                snapshot.coinBalance(), Timestamp.from(snapshot.firstReachedAt()),
                Timestamp.from(selectedAt));
    }

    List<AssetWinner> winners(long roundId) {
        return jdbc.query("""
                SELECT s.place, s.prize_name, w.user_id, u.nickname, w.source_record_id,
                       w.source_value, w.source_achieved_at, w.selected_at
                FROM event_winners w JOIN event_prize_slots s ON s.id = w.prize_slot_id
                JOIN users u ON u.id = w.user_id
                WHERE w.event_round_id = ? ORDER BY s.place
                """, (row, index) -> new AssetWinner(row.getInt("place"), row.getString("prize_name"),
                row.getLong("user_id"), row.getString("nickname"), row.getString("source_record_id"),
                row.getLong("source_value"), row.getTimestamp("source_achieved_at").toInstant(),
                row.getTimestamp("selected_at").toInstant()), roundId);
    }

    void finalizeRound(long roundId, Instant now, Long administratorId) {
        jdbc.update("""
                UPDATE event_rounds SET finalized_at = ?, finalization_source = ?, finalized_by_user_id = ?
                WHERE id = ? AND finalized_at IS NULL
                """, Timestamp.from(now), administratorId == null ? "AUTO" : "ADMIN",
                administratorId, roundId);
    }

    void insertAttempt(long roundId, Long administratorId, String outcome,
            Integer candidates, Integer excludedGm, Integer winners, Instant now) {
        jdbc.update("""
                INSERT INTO event_finalization_attempts(event_round_id, trigger_source,
                    administrator_user_id, outcome, candidate_count, excluded_gm_count,
                    winner_count, error_code, attempted_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, roundId, administratorId == null ? "AUTO" : "ADMIN", administratorId,
                outcome, candidates, excludedGm, winners,
                "FAILED".equals(outcome) ? "EVENT_FINALIZATION_FAILED" : null,
                Timestamp.from(now), Timestamp.from(now));
    }

    Optional<Counts> successfulCounts(long roundId) {
        return jdbc.query("""
                SELECT candidate_count, excluded_gm_count FROM event_finalization_attempts
                WHERE event_round_id = ? AND outcome = 'SUCCEEDED' ORDER BY id DESC LIMIT 1
                """, (row, index) -> new Counts(row.getInt("candidate_count"),
                row.getInt("excluded_gm_count")), roundId).stream().findFirst();
    }

    private Instant instant(ResultSet row, String column) throws SQLException {
        Timestamp value = row.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    record Round(long id, LocalDate week, Instant startsAt, Instant endsAt,
            Instant announcesAt, Instant finalizedAt) {}
    record SnapshotEntry(Snapshot snapshot, boolean excludedGm) {}
    record Slot(long id, int place, int slotNumber, String prizeName) {}
    record Counts(int candidateCount, int excludedGmCount) {}
}
