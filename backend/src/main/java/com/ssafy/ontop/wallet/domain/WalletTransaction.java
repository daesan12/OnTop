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

    public long balanceDelta() {
        return balanceDelta;
    }

    public static WalletTransaction adminBulkGrant(long walletId, long batchId, long userId,
            long amount, Instant now) {
        if (walletId <= 0 || batchId <= 0 || userId <= 0 || amount <= 0) {
            throw new IllegalArgumentException("관리자 일괄 지급 원장을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.transactionType = "ADMIN_BULK_GRANT";
        transaction.balanceDelta = amount;
        transaction.reservedDelta = 0;
        transaction.idempotencyKey = "admin-grant:" + batchId + ":" + userId;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
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

    public static WalletTransaction rafflePurchase(long walletId, long price, String key, Instant now) {
        if (walletId <= 0 || price <= 0 || key == null || !key.startsWith("raffle:") || key.length() > 120) {
            throw new IllegalArgumentException("응모권 구매 원장을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = -price;
        transaction.transactionType = "RAFFLE_PURCHASE";
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
        if (sessionId <= 0) {
            throw new IllegalArgumentException("미니게임 보상 기록을 확인하세요.");
        }
        return minigameRewardEntry(walletId, sessionId, reward, key, now);
    }

    /** Reward for a game with its own round table. The key identifies the round in the ledger. */
    public static WalletTransaction minigameReward(long walletId, long reward, String key, Instant now) {
        return minigameRewardEntry(walletId, null, reward, key, now);
    }

    private static WalletTransaction minigameRewardEntry(long walletId, Long sessionId, long reward, String key, Instant now) {
        if (walletId <= 0 || reward <= 0 || key == null || key.length() > 120) {
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

    /** 무료 협동 미니게임 보상. 공통 일일 한도와 원장 멱등 키를 재사용한다. */
    public static WalletTransaction skewerReward(long walletId, long reward, String key, Instant now) {
        if (walletId <= 0 || reward <= 0 || key == null || !key.startsWith("skewer-coop:") || key.length() > 120) {
            throw new IllegalArgumentException("꼬치왕 보상 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = reward;
        transaction.transactionType = "SKEWER_REWARD";
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    /** 두더지 잡기 점수 보상. 미니게임 공통 하루 상한에 합산하며 판마다 한 번만 쓴다. */
    public static WalletTransaction moleReward(long walletId, long reward, String key, Instant now) {
        if (walletId <= 0 || reward <= 0 || key == null || !key.startsWith("mole:reward:") || key.length() > 120) {
            throw new IllegalArgumentException("두더지 잡기 보상 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = reward;
        transaction.transactionType = "MOLE_REWARD";
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

    /** 더하기 빼기 아케이드 배당. 참가비를 건 판의 결과라 미니게임 공통 하루 상한 합산 대상이 아니다. */
    public static WalletTransaction plusMinusPayout(long walletId, long payout, String key, Instant now) {
        if (walletId <= 0 || payout <= 0 || key == null || !key.startsWith("plus-minus:payout:")
                || key.length() > 120) {
            throw new IllegalArgumentException("더하기 빼기 아케이드 배당 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = payout;
        transaction.transactionType = "PLUS_MINUS_PAYOUT";
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

    public static WalletTransaction fitnessReward(long walletId, String key, long amount, Instant now) {
        if (walletId <= 0 || amount <= 0 || key == null || !key.startsWith("fitness:") || key.length() > 120) {
            throw new IllegalArgumentException("운동 보상 기록을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.balanceDelta = amount;
        transaction.transactionType = "FITNESS_REWARD";
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
    }

    public static WalletTransaction gameReserve(long walletId, long gameSessionId, long userId, Instant now) {
        return gameReserve(walletId, gameSessionId, userId, 1, now);
    }

    public static WalletTransaction gameReserve(long walletId, long gameSessionId, long userId, long amount, Instant now) {
        if (walletId <= 0 || gameSessionId <= 0 || userId <= 0 || amount < 0) {
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
        if (amount < 0 || (release || amount == 0) && potDelta != 0) { throw new IllegalArgumentException("정산 내역을 확인하세요."); }
        return gameEntry(walletId, gameId, userId, release ? "GAME_RELEASE" : "GAME_SETTLEMENT",
                potDelta, -amount, "close", now);
    }

    public static WalletTransaction gameTieBonus(long walletId, long gameId, long userId, long bonus, Instant now) {
        if (bonus <= 0) { throw new IllegalArgumentException("보너스를 확인하세요."); }
        return gameEntry(walletId, gameId, userId, "GAME_TIE_BONUS", bonus, 0, "bonus", now);
    }

    public static WalletTransaction gameRankReward(long walletId, long gameId, long userId, long reward, Instant now) {
        if (reward < 10 || reward > 80 || reward % 5 != 0) { throw new IllegalArgumentException("순위 보상을 확인하세요."); }
        return gameEntry(walletId, gameId, userId, "GAME_RANK_REWARD", reward, 0, "rank-reward", now);
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

    /** 의상 뽑기의 유료 구매·당첨/중복 환급. 미니게임 일일 보상 한도와 별개다. */
    public static WalletTransaction gacha(long walletId, long delta, String key, Instant now) {
        if (walletId <= 0 || delta == 0 || key == null || !key.startsWith("gacha:") || key.length() > 120) {
            throw new IllegalArgumentException("뽑기 원장을 확인하세요.");
        }
        WalletTransaction transaction = new WalletTransaction();
        transaction.walletId = walletId;
        transaction.transactionType = delta < 0 ? "GACHA_PURCHASE" : "GACHA_PAYOUT";
        transaction.balanceDelta = delta;
        transaction.reservedDelta = 0;
        transaction.idempotencyKey = key;
        transaction.createdAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        return transaction;
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
