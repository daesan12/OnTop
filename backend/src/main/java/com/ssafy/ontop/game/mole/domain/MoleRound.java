package com.ssafy.ontop.game.mole.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** 두더지 잡기 한 판. START에 시드를 정하고, 완료 때 그 시드로 출현표를 다시 만들어 점수와 지급액을 확정한다. */
@Entity
@Table(name = "mole_rounds")
public class MoleRound {
    public enum Status { ACTIVE, SETTLED, EXPIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(name = "request_key", nullable = false, updatable = false, length = 64)
    private String requestKey;
    @Column(nullable = false, updatable = false)
    private long seed;
    @Column(name = "rules_version", nullable = false, updatable = false, columnDefinition = "TINYINT")
    private int rulesVersion;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private Status status;
    @Column(name = "started_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant startedAt;
    @Column(name = "settled_at", columnDefinition = "TIMESTAMP(3)")
    private Instant settledAt;
    private Integer score;
    @Column(name = "max_combo")
    private Integer maxCombo;
    private Integer caught;
    @Column(name = "calculated_reward")
    private Integer calculatedReward;
    private Integer reward;

    protected MoleRound() {
    }

    public static MoleRound start(long userId, String requestKey, long seed, Instant now) {
        if (userId <= 0 || requestKey == null) {
            throw new IllegalArgumentException("판 정보를 확인하세요.");
        }
        MoleRound round = new MoleRound();
        round.userId = userId;
        round.requestKey = requestKey;
        round.seed = seed;
        round.rulesVersion = MoleRules.RULES_VERSION;
        round.status = Status.ACTIVE;
        round.startedAt = now.truncatedTo(ChronoUnit.MILLIS);
        return round;
    }

    public void settle(MoleRules.Score result, int granted, Instant now) {
        if (status != Status.ACTIVE || granted < 0 || granted > result.coins()) {
            throw new IllegalStateException("진행 중인 판만 정산할 수 있어요.");
        }
        status = Status.SETTLED;
        settledAt = now.truncatedTo(ChronoUnit.MILLIS);
        score = result.score();
        maxCombo = result.maxCombo();
        caught = result.caught();
        calculatedReward = result.coins();
        reward = granted;
    }

    public void expire(Instant now) {
        if (status == Status.ACTIVE) {
            status = Status.EXPIRED;
            settledAt = now.truncatedTo(ChronoUnit.MILLIS);
        }
    }

    public long id() {
        return id;
    }

    public long userId() {
        return userId;
    }

    public long seed() {
        return seed;
    }

    public Status status() {
        return status;
    }

    public Instant startedAt() {
        return startedAt;
    }

    public Instant settledAt() {
        return settledAt;
    }

    public Integer score() {
        return score;
    }

    public Integer maxCombo() {
        return maxCombo;
    }

    public Integer caught() {
        return caught;
    }

    public Integer calculatedReward() {
        return calculatedReward;
    }

    public Integer reward() {
        return reward;
    }
}
