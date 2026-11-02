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
        debit(total, Instant.now());
    }

    public void debit(long total, Instant now) {
        balance -= total;
        updatedAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
    }

    public void reserveGameEntry(Instant now) {
        reserveGameEntry(1, now);
    }

    public void reserveGameEntry(long amount, Instant now) {
        if (amount < 0 || reserved < 0 || balance < reserved || balance - reserved < amount) {
            throw new IllegalStateException("참가비를 예약할 수 없습니다.");
        }
        reserved = Math.addExact(reserved, amount);
        updatedAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
    }

    public void settleGame(long amount, long balanceDelta, Instant now) {
        if (amount < 0 || reserved < amount || balance < reserved || balanceDelta < -amount || amount == 0 && balanceDelta != 0) {
            throw new IllegalStateException("경기 예약 상태를 확인하세요.");
        }
        long nextBalance = Math.addExact(balance, balanceDelta);
        long nextReserved = Math.subtractExact(reserved, amount);
        if (nextBalance < 0 || nextBalance < nextReserved) {
            throw new IllegalStateException("경기 정산 잔액을 확인하세요.");
        }
        balance = nextBalance;
        reserved = nextReserved;
        updatedAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
    }

    public void creditReward(long amount) {
        if (amount < 0 || reserved < 0 || balance < reserved) {
            throw new IllegalArgumentException("보상 금액과 지갑 상태를 확인하세요.");
        }
        balance = Math.addExact(balance, amount);
        updatedAt = Instant.now();
    }
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

}
