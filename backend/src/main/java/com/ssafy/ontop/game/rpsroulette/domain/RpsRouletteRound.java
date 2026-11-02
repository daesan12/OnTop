package com.ssafy.ontop.game.rpsroulette.domain;

import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Hand;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Result;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** 한 판의 서버 상태. 공개 전 기계 손과 salt는 응답에 싣지 않는다. */
@Entity
@Table(name = "rps_roulette_rounds")
public class RpsRouletteRound {
    public enum Phase { DUEL, DECIDE, SETTLED }

    public enum Outcome { LOST, PAID }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(name = "request_key", nullable = false, updatable = false, length = 64)
    private String requestKey;
    @Column(name = "active_user_id")
    private Long activeUserId;
    @Column(nullable = false, updatable = false)
    private int fee;
    @Column(name = "play_date", nullable = false, updatable = false)
    private LocalDate playDate;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Phase phase;
    @Column(name = "stake_level", nullable = false, columnDefinition = "TINYINT")
    private int stakeLevel;
    @Column(nullable = false)
    private boolean challenging;
    @Column(nullable = false)
    private int seq;
    @Column(name = "duel_no", nullable = false)
    private int duelNo;
    @Enumerated(EnumType.STRING)
    @Column(name = "machine_hand", length = 8)
    private Hand machineHand;
    @Column(name = "machine_salt", length = 32, columnDefinition = "CHAR(32)")
    private String machineSalt;
    @Column(length = 64, columnDefinition = "CHAR(64)")
    private String commitment;
    @Column(name = "input_ends_at", columnDefinition = "TIMESTAMP(3)")
    private Instant inputEndsAt;
    @Column(name = "deadline_at", columnDefinition = "TIMESTAMP(3)")
    private Instant deadlineAt;
    @Column(name = "last_duel_no")
    private Integer lastDuelNo;
    @Enumerated(EnumType.STRING)
    @Column(name = "last_player_hand", length = 8)
    private Hand lastPlayerHand;
    @Enumerated(EnumType.STRING)
    @Column(name = "last_machine_hand", length = 8)
    private Hand lastMachineHand;
    @Column(name = "last_salt", length = 32, columnDefinition = "CHAR(32)")
    private String lastSalt;
    @Enumerated(EnumType.STRING)
    @Column(name = "last_result", length = 8)
    private Result lastResult;
    @Column(name = "last_auto", nullable = false)
    private boolean lastAuto;
    @Enumerated(EnumType.STRING)
    @Column(length = 8)
    private Outcome outcome;
    @Column(name = "roulette_cell", columnDefinition = "TINYINT")
    private Integer rouletteCell;
    @Column(nullable = false)
    private int payout;
    @Column(name = "started_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant startedAt;
    @Column(name = "settled_at", columnDefinition = "TIMESTAMP(3)")
    private Instant settledAt;

    protected RpsRouletteRound() {
    }

    public static RpsRouletteRound start(long userId, String requestKey, int fee, LocalDate playDate, Instant now,
            Hand machine, String salt) {
        if (userId <= 0 || !RpsRouletteRules.isFee(fee)) {
            throw new IllegalArgumentException("판 시작 정보를 확인하세요.");
        }
        RpsRouletteRound round = new RpsRouletteRound();
        round.userId = userId;
        round.requestKey = requestKey;
        round.activeUserId = userId;
        round.fee = fee;
        round.playDate = playDate;
        round.seq = 1;
        round.duelNo = 1;
        round.startedAt = millis(now);
        round.armDuel(machine, salt, now);
        return round;
    }

    /** 미리 정한 기계 손을 공개한다. 비기면 다음 손을 같은 판에 다시 건다. */
    public Result reveal(Hand player, boolean auto, Instant now, Hand nextMachine, String nextSalt) {
        requirePhase(Phase.DUEL);
        Result result = RpsRouletteRules.judge(player, machineHand);
        lastDuelNo = duelNo;
        lastPlayerHand = player;
        lastMachineHand = machineHand;
        lastSalt = machineSalt;
        lastResult = result;
        lastAuto = auto;
        seq++;
        if (result == Result.DRAW) {
            duelNo++;
            armDuel(nextMachine, nextSalt, now);
        } else if (result == Result.LOSE) {
            settle(Outcome.LOST, null, 0, now);
        } else {
            if (challenging) {
                stakeLevel++;
                challenging = false;
            }
            clearDuel();
            phase = Phase.DECIDE;
            inputEndsAt = millis(now.plus(RpsRouletteRules.DECIDE_LIMIT));
            deadlineAt = millis(inputEndsAt.plus(RpsRouletteRules.GRACE));
        }
        return result;
    }

    public void challenge(Instant now, Hand machine, String salt) {
        requirePhase(Phase.DECIDE);
        if (stakeLevel >= RpsRouletteRules.MAX_CHALLENGES) {
            throw new IllegalStateException("도전은 두 번까지만 할 수 있습니다.");
        }
        challenging = true;
        duelNo++;
        seq++;
        armDuel(machine, salt, now);
    }

    public void pay(int cell, Instant now) {
        requirePhase(Phase.DECIDE);
        seq++;
        settle(Outcome.PAID, cell, RpsRouletteRules.payout(fee, stakeLevel, cell), now);
    }

    public boolean canSpinNow() {
        return phase == Phase.DECIDE && stakeLevel >= RpsRouletteRules.MAX_CHALLENGES;
    }

    public boolean isExpired(Instant now) {
        return phase != Phase.SETTLED && now.isAfter(deadlineAt);
    }

    private void armDuel(Hand machine, String salt, Instant now) {
        phase = Phase.DUEL;
        machineHand = machine;
        machineSalt = salt;
        commitment = RpsRouletteRules.commitment(duelNo, machine, salt);
        inputEndsAt = millis(now.plus(RpsRouletteRules.DUEL_LIMIT));
        deadlineAt = millis(inputEndsAt.plus(RpsRouletteRules.GRACE));
    }

    private void settle(Outcome result, Integer cell, int amount, Instant now) {
        phase = Phase.SETTLED;
        outcome = result;
        rouletteCell = cell;
        payout = amount;
        activeUserId = null;
        settledAt = millis(now);
        // 지면 challenging을 남겨 화면이 "도전 실패"와 첫 대결 패배를 구분하게 한다.
        clearDuel();
        inputEndsAt = null;
        deadlineAt = null;
    }

    private void clearDuel() {
        machineHand = null;
        machineSalt = null;
        commitment = null;
    }

    private void requirePhase(Phase expected) {
        if (phase != expected) {
            throw new IllegalStateException("판 단계가 맞지 않습니다: " + phase);
        }
    }

    private static Instant millis(Instant instant) {
        return instant.truncatedTo(ChronoUnit.MILLIS);
    }

    public long id() {
        return id;
    }

    public long userId() {
        return userId;
    }

    public String requestKey() {
        return requestKey;
    }

    public int fee() {
        return fee;
    }

    public LocalDate playDate() {
        return playDate;
    }

    public Phase phase() {
        return phase;
    }

    public int stakeLevel() {
        return stakeLevel;
    }

    public boolean challenging() {
        return challenging;
    }

    public int seq() {
        return seq;
    }

    public int duelNo() {
        return duelNo;
    }

    public String commitment() {
        return commitment;
    }

    public Instant inputEndsAt() {
        return inputEndsAt;
    }

    public Instant deadlineAt() {
        return deadlineAt;
    }

    public Integer lastDuelNo() {
        return lastDuelNo;
    }

    public Hand lastPlayerHand() {
        return lastPlayerHand;
    }

    public Hand lastMachineHand() {
        return lastMachineHand;
    }

    public String lastSalt() {
        return lastSalt;
    }

    public Result lastResult() {
        return lastResult;
    }

    public boolean lastAuto() {
        return lastAuto;
    }

    public Outcome outcome() {
        return outcome;
    }

    public Integer rouletteCell() {
        return rouletteCell;
    }

    public int payout() {
        return payout;
    }

    public Instant startedAt() {
        return startedAt;
    }

    public Instant settledAt() {
        return settledAt;
    }
}
