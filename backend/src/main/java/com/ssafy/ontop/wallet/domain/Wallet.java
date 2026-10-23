package com.ssafy.ontop.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

/** wallets 테이블의 사용자 지갑. 현재 구매 차감에 사용하며 게임 정산은 별도 연결한다. */
@Entity(name = "Wallet")
@Table(name = "wallets")
public class Wallet {
    public static final long SIGNUP_BALANCE = 100L;

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

    protected Wallet() { }

    public static Wallet forSignup(long userId, Instant now) {
        if (userId <= 0) {
            throw new IllegalArgumentException("내부 회원 ID가 필요합니다.");
        }
        Wallet wallet = new Wallet();
        wallet.userId = userId;
        wallet.balance = SIGNUP_BALANCE;
        wallet.reserved = 0;
        wallet.updatedAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return wallet;
    }

    public long id() { return id; }
    public long balance() { return balance; }
    public long reserved() { return reserved; }
    public void debit(long total) { balance -= total; updatedAt = Instant.now(); }
}
