package com.ssafy.ontop.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity(name = "WalletTransaction")
@Table(name = "wallet_transactions")
public class WalletTransaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "wallet_id", nullable = false)
    private long walletId;
    @Column(name = "game_session_id")
    private Long gameSessionId;
    @Column(name = "minigame_session_id")
    private Long minigameSessionId;
    @Column(name = "item_id")
    private Long itemId;
    @Column(name = "transaction_type", nullable = false, length = 32)
    private String transactionType;
    @Column(name = "balance_delta", nullable = false)
    private long balanceDelta;
    @Column(name = "reserved_delta", nullable = false)
    private long reservedDelta;
    @Column(name = "idempotency_key", nullable = false, length = 120)
    private String idempotencyKey;
    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant createdAt;

    protected WalletTransaction() { }
    public WalletTransaction(long walletId, long itemId, long total, String key) {
        this.walletId = walletId; this.itemId = itemId; balanceDelta = -total;
        transactionType = "SHOP_PURCHASE"; idempotencyKey = key; createdAt = Instant.now();
    }
}
