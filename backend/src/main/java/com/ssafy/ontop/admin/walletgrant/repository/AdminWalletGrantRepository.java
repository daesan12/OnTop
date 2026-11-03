package com.ssafy.ontop.admin.walletgrant.repository;

import com.ssafy.ontop.admin.walletgrant.domain.AdminWalletGrantBatch;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;

public class AdminWalletGrantRepository {
    private final JdbcTemplate jdbc;

    public AdminWalletGrantRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AdminWalletGrantBatch> findBatch(UUID requestId) {
        return jdbc.query("""
                SELECT id, request_id, administrator_user_id, amount_per_member, reason,
                       recipient_count, total_amount, executed_at
                FROM admin_wallet_grant_batches
                WHERE request_id = ?
                """, (rows, index) -> new AdminWalletGrantBatch(rows.getLong("id"),
                UUID.fromString(rows.getString("request_id")), rows.getLong("administrator_user_id"),
                rows.getLong("amount_per_member"), rows.getString("reason"), rows.getLong("recipient_count"),
                rows.getLong("total_amount"), rows.getTimestamp("executed_at").toInstant()),
                requestId.toString()).stream().findFirst();
    }

    public long insertBatch(UUID requestId, long administratorUserId, long amountPerMember,
            String reason, long recipientCount, long totalAmount, Instant executedAt) {
        var key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO admin_wallet_grant_batches(
                        request_id, administrator_user_id, amount_per_member, reason,
                        recipient_count, total_amount, executed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, requestId.toString());
            statement.setLong(2, administratorUserId);
            statement.setLong(3, amountPerMember);
            statement.setString(4, reason);
            statement.setLong(5, recipientCount);
            statement.setLong(6, totalAmount);
            statement.setTimestamp(7, Timestamp.from(executedAt));
            return statement;
        }, key);
        Number id = key.getKey();
        if (id == null) {
            throw new IllegalStateException("저장된 일괄 지급 배치 ID를 확인할 수 없습니다.");
        }
        return id.longValue();
    }

    public void insertEntry(long batchId, long userId, long walletTransactionId,
            long balanceBefore, long balanceAfter) {
        jdbc.update("""
                INSERT INTO admin_wallet_grant_entries(
                    batch_id, user_id, wallet_transaction_id, balance_before, balance_after
                ) VALUES (?, ?, ?, ?, ?)
                """, batchId, userId, walletTransactionId, balanceBefore, balanceAfter);
    }
}
