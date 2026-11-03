package com.ssafy.ontop.game.plusminus.domain;

import com.ssafy.ontop.game.plusminus.domain.PlusMinusRules.Outcome;
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

/** START 순간 정산까지 끝난 한 판. 정지 버튼은 화면 연출이라 서버 상태가 바뀌지 않는다. */
@Entity
@Table(name = "plus_minus_rounds")
public class PlusMinusRound {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(name = "request_key", nullable = false, updatable = false, length = 64)
    private String requestKey;
    @Column(nullable = false, updatable = false)
    private int fee;
    @Column(name = "play_date", nullable = false, updatable = false)
    private LocalDate playDate;
    @Column(name = "first_cell", nullable = false, updatable = false, columnDefinition = "TINYINT")
    private int firstCell;
    @Column(name = "operator_cell", nullable = false, updatable = false, columnDefinition = "TINYINT")
    private int operatorCell;
    @Column(name = "second_cell", nullable = false, updatable = false, columnDefinition = "TINYINT")
    private int secondCell;
    @Column(name = "result_value", updatable = false)
    private Integer result;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false, length = 8)
    private Outcome outcome;
    @Column(nullable = false, updatable = false)
    private int payout;
    @Column(name = "played_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant playedAt;

    protected PlusMinusRound() {
    }

    public static PlusMinusRound play(long userId, String requestKey, LocalDate playDate, Instant now,
            int firstCell, int operatorCell, int secondCell) {
        if (userId <= 0 || firstCell < 0 || firstCell >= PlusMinusRules.FIRST_REEL.size()
                || operatorCell < 0 || operatorCell >= PlusMinusRules.OPERATOR_REEL.size()
                || secondCell < 0 || secondCell >= PlusMinusRules.SECOND_REEL.size()) {
            throw new IllegalArgumentException("판 정보를 확인하세요.");
        }
        PlusMinusRound round = new PlusMinusRound();
        round.userId = userId;
        round.requestKey = requestKey;
        round.fee = PlusMinusRules.FEE;
        round.playDate = playDate;
        round.firstCell = firstCell;
        round.operatorCell = operatorCell;
        round.secondCell = secondCell;
        round.result = PlusMinusRules.result(firstCell, operatorCell, secondCell);
        round.outcome = PlusMinusRules.outcome(firstCell, operatorCell, secondCell);
        round.payout = PlusMinusRules.payout(firstCell, operatorCell, secondCell);
        round.playedAt = now.truncatedTo(ChronoUnit.MILLIS);
        return round;
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

    public int firstCell() {
        return firstCell;
    }

    public int operatorCell() {
        return operatorCell;
    }

    public int secondCell() {
        return secondCell;
    }

    public Integer result() {
        return result;
    }

    public Outcome outcome() {
        return outcome;
    }

    public int payout() {
        return payout;
    }

    public Instant playedAt() {
        return playedAt;
    }
}
