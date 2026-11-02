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
    @Column(name = "departure_event_version")
    private Long departureEventVersion;
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.BINARY)
    @Column(name = "departure_payload_hash", columnDefinition = "BINARY(32)")
    private byte[] departurePayloadHash;
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
        if (amount < 0) { throw new IllegalArgumentException("예약액을 확인하세요."); }
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
    public GameDepartureReason leaveReason() { return leaveReason; }
    public Instant leftAt() { return leftAt; }

    public void recordDeparture(GameDepartureReason reason, Instant at, long version, byte[] hash) {
        if (departureEventVersion != null && (departureEventVersion != version
                || !java.util.Arrays.equals(departurePayloadHash, hash))) {
            throw new IllegalStateException("이미 수신한 이탈 이벤트와 다릅니다.");
        }
        recordDeparture(reason, at);
        departureEventVersion = version;
        departurePayloadHash = hash.clone();
    }

    public void recordDeparture(GameDepartureReason reason, Instant at) {
        Instant occurredAt = java.util.Objects.requireNonNull(at)
                .truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        java.util.Objects.requireNonNull(reason);
        if (leaveReason != null) {
            if (leaveReason != reason || !occurredAt.equals(leftAt)) {
                throw new IllegalStateException("이미 저장된 이탈 정보와 다릅니다.");
            }
            return;
        }
        if (participantStatus != Status.ACTIVE || result != null || reservationReleasedAt != null) {
            throw new IllegalStateException("종결된 참가자의 이탈 정보를 변경할 수 없습니다.");
        }
        leaveReason = reason;
        leftAt = occurredAt;
        participantStatus = Status.LEFT;
    }

    public void recordFinish(GameFinished.Participant outcome) {
        if (outcome.userId() != userId || outcome.result() == null || reservationReleasedAt != null || result != null) {
            throw new IllegalStateException("경기 참가 결과를 확인하세요.");
        }
        if (leaveReason != null && (leaveReason != outcome.leaveReason() || outcome.leftAt() == null
                || !leftAt.equals(outcome.leftAt().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)))) {
            throw new IllegalStateException("최종 판정과 저장된 이탈 정보가 다릅니다.");
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

    /** 판정 없는 INVALID에도 사용한다. 정상 경기의 결과 필수 검증은 closeReservation에 유지한다. */
    public void releaseInvalidReservation(Instant now) {
        if (reservationReleasedAt != null || coinDelta != null) {
            throw new IllegalStateException("이미 반환된 참가비입니다.");
        }
        coinDelta = 0L;
        reservationReleasedAt = java.util.Objects.requireNonNull(now);
        participantStatus = Status.FINISHED;
    }

    public enum Status { ACTIVE, LEFT, FINISHED }
}
