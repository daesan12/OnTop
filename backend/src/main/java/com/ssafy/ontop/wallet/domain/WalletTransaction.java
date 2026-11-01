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

    protected WalletTransaction() {
    }

    public long id() {
        return id;
    }

    public static WalletTransaction minigameEntryFee(long walletId, long fee, String key, Instant now) {
        if (walletId <= 0 || fee <= 0 || key == null || key.isBlank() || key.length() > 120) {
            throw new IllegalArgumentException("미니게임 이용료 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = -fee;
        transaction.transactionType = "MINIGAME_ENTRY_FEE";
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    public WalletTransaction(long walletId, long itemId, long total, String key) {
        this.walletId = walletId;
        this.itemId = itemId;
        balanceDelta = -total;
        transactionType = "SHOP_PURCHASE";
        idempotencyKey = key;
        createdAt = Instant.now();
    }

    public static WalletTransaction minigameReward(long walletId, long sessionId, long reward, String key) {
        return minigameReward(walletId, sessionId, reward, key, Instant.now());
    }

    public static WalletTransaction minigameReward(long walletId, long sessionId, long reward, String key, Instant now) {
        if (walletId <= 0 || sessionId <= 0 || reward <= 0 || key == null || key.length() > 120) {
            throw new IllegalArgumentException("미니게임 보상 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.minigameSessionId = sessionId;
        transaction.balanceDelta = reward;
        transaction.transactionType = "MINIGAME_REWARD";
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    /** 참가비를 건 판의 배당. 보상이 아니므로 미니게임 공통 하루 상한 합산 대상이 아니다. */
    public static WalletTransaction rpsRoulettePayout(long walletId, long payout, String key, Instant now) {
        if (walletId <= 0 || payout <= 0 || key == null || !key.startsWith("rps-roulette:payout:")
                || key.length() > 120) {
            throw new IllegalArgumentException("가위바위보 룰렛 배당 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = payout;
        transaction.transactionType = "RPS_ROULETTE_PAYOUT";
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    public static String signupBonusKey(long userId) {
        if (userId <= 0) {
            throw new IllegalArgumentException("내부 회원 ID가 필요합니다.");
        }
        return "signup:" + userId;
    }

    public static WalletTransaction fitnessReward(long walletId, String key, Instant now) {
        if (walletId <= 0 || key == null || !key.startsWith("fitness:") || key.length() > 120) {
            throw new IllegalArgumentException("운동 보상 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = 1;
        transaction.transactionType = "FITNESS_REWARD";
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    public static WalletTransaction gameReserve(long walletId, long gameSessionId, long userId, Instant now) {
        return gameReserve(walletId, gameSessionId, userId, 1, now);
    }

    public static WalletTransaction gameReserve(long walletId, long gameSessionId, long userId, long amount, Instant now) {
        if (walletId <= 0 || gameSessionId <= 0 || userId <= 0 || amount <= 0) {
            throw new IllegalArgumentException("저장된 지갑과 경기 및 회원이 필요합니다.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.gameSessionId = gameSessionId;
        transaction.transactionType = "GAME_RESERVE";
        transaction.reservedDelta = amount;
        transaction.idempotencyKey = "game:" + gameSessionId + ":reserve:" + userId;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    public static WalletTransaction gameClose(long walletId, long gameId, long userId, long amount,
            long potDelta, boolean release, Instant now) {
        if (amount <= 0 || release && potDelta != 0) { throw new IllegalArgumentException("정산 내역을 확인하세요."); }
        return gameEntry(walletId, gameId, userId, release ? "GAME_RELEASE" : "GAME_SETTLEMENT",
                potDelta, -amount, "close", now);
    }

    public static WalletTransaction gameTieBonus(long walletId, long gameId, long userId, long bonus, Instant now) {
        if (bonus <= 0) { throw new IllegalArgumentException("보너스를 확인하세요."); }
        return gameEntry(walletId, gameId, userId, "GAME_TIE_BONUS", bonus, 0, "bonus", now);
    }

    private static WalletTransaction gameEntry(long walletId, long gameId, long userId, String type,
            long balanceDelta, long reservedDelta, String operation, Instant now) {
        if (walletId <= 0 || gameId <= 0 || userId <= 0) { throw new IllegalArgumentException("경기 원장을 확인하세요."); }
        WalletTransaction entry = new WalletTransaction();
        entry.walletId = walletId;
        entry.gameSessionId = gameId;
        entry.transactionType = type;
        entry.balanceDelta = balanceDelta;
        entry.reservedDelta = reservedDelta;
        entry.idempotencyKey = "game:" + gameId + ":" + operation + ":" + userId;
        entry.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return entry;
    }

    public static WalletTransaction signupBonus(long walletId, long userId, Instant now) {
        if (walletId <= 0) {
            throw new IllegalArgumentException("저장된 지갑이 필요합니다.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.transactionType = "SIGNUP_BONUS";
        transaction.balanceDelta = Wallet.SIGNUP_BALANCE;
        transaction.reservedDelta = 0;
        transaction.idempotencyKey = signupBonusKey(userId);
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }
}
