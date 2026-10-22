package com.ssafy.ontop.shop.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** 공통 wallets의 상점 사용 컬럼 매핑. 생성·초기화·게임 정산은 수행하지 않는다. */
@Entity(name = "ShopWallet")
@Table(name = "wallets")
public class ShopWallet {
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

    protected ShopWallet() { }
    public long id() { return id; }
    public long balance() { return balance; }
    public long reserved() { return reserved; }
    public void debit(long total) { balance -= total; updatedAt = Instant.now(); }
}
