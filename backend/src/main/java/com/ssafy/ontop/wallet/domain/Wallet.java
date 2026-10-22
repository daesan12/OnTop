package com.ssafy.ontop.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** wallets 테이블의 사용자 지갑. 현재 구매 차감에 사용하며 게임 정산은 별도 연결한다. */
@Entity(name = "Wallet")
@Table(name = "wallets")
public class Wallet {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(nullable = false)
    private long balance;
    @Column(name = "reserved_balance", nullable = false)
    private long reserved;
    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant updatedAt;

    protected Wallet() {
    }

    public long id() {
        return id;
    }

    public long balance() {
        return balance;
    }

    public long reserved() {
        return reserved;
    }

    public void debit(long total) {
        balance -= total;
        updatedAt = Instant.now();
    }
}
