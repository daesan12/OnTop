package com.ssafy.ontop.game.domain;

import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "game_participants")
public class GameParticipant {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "game_session_id", nullable = false, updatable = false)
    private long gameSessionId;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(name = "seat_number", nullable = false, updatable = false)
    private short seatNumber;
    @Column(name = "participant_order", nullable = false, updatable = false)
    private short participantOrder;
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "participant_status", nullable = false, length = 16)
    private Status participantStatus;
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(length = 10)
    private GameFinished.Result result;
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "leave_reason", length = 32)
    private GameDepartureReason leaveReason;
    @Column(name = "left_at", columnDefinition = "TIMESTAMP(3)")
    private Instant leftAt;
    @Column(name = "reserved_amount", nullable = false, updatable = false)
    private long reservedAmount;
    @Column(name = "coin_delta")
    private Long coinDelta;
    @Column(name = "reservation_released_at", columnDefinition = "TIMESTAMP(3)")
    private Instant reservationReleasedAt;
    @Column(name = "active_user_id", insertable = false, updatable = false)
    private Long activeUserId;

    protected GameParticipant() {
    }

    public GameParticipant(long gameSessionId, long userId, int seatNumber, int participantOrder) {
        this(gameSessionId, userId, seatNumber, participantOrder, 1);
    }

    public GameParticipant(long gameSessionId, long userId, int seatNumber, int participantOrder, long amount) {
        if (amount <= 0) { throw new IllegalArgumentException("예약액을 확인하세요."); }
        this.gameSessionId = gameSessionId;
        this.userId = userId;
        this.seatNumber = (short) seatNumber;
        this.participantOrder = (short) participantOrder;
        participantStatus = Status.ACTIVE;
        reservedAmount = amount;
    }

    public long userId() { return userId; }
    public int seatNumber() { return seatNumber; }
    public GameFinished.Result result() { return result; }
    public long reservedAmount() { return reservedAmount; }
    public Long coinDelta() { return coinDelta; }
    public Instant reservationReleasedAt() { return reservationReleasedAt; }

    public void recordFinish(GameFinished.Participant outcome) {
        if (outcome.userId() != userId || reservationReleasedAt != null || result != null) {
            throw new IllegalStateException("경기 참가 결과를 확인하세요.");
        }
        result = outcome.result();
        leaveReason = outcome.leaveReason();
        leftAt = outcome.leftAt() == null ? null : outcome.leftAt().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        participantStatus = Status.FINISHED;
    }

    public void closeReservation(long delta, Instant now) {
        if (result == null || reservationReleasedAt != null || coinDelta != null) {
            throw new IllegalStateException("참가비 정산 상태를 확인하세요.");
        }
        coinDelta = delta;
        reservationReleasedAt = now;
    }

    public enum Status { ACTIVE, LEFT, FINISHED }
}
