package com.ssafy.ontop.game.domain;

import com.ssafy.ontop.game.start.GameStartCommand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "game_sessions")
public class GameSession {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "start_attempt_id", nullable = false, updatable = false, columnDefinition = "BINARY(16)")
    private UUID startAttemptId;
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "request_fingerprint", nullable = false, updatable = false, columnDefinition = "BINARY(32)")
    private byte[] requestFingerprint;
    @Column(name = "table_id", nullable = false, updatable = false, length = 120)
    private String tableId;
    @Column(name = "table_version", nullable = false, updatable = false)
    private long tableVersion;
    @Column(name = "game_code", nullable = false, updatable = false, length = 20)
    private String gameCode;
    @Column(name = "target_score", updatable = false)
    private Integer targetScore;
    @Column(name = "participant_count", nullable = false, updatable = false)
    private short participantCount;
    @Column(name = "bet_amount_per_player", nullable = false, updatable = false)
    private long betAmountPerPlayer;
    @Column(name = "total_pot", nullable = false, updatable = false)
    private long totalPot;
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 16)
    private Status status;
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "settlement_status", length = 16)
    private SettlementStatus settlementStatus;
    @Column(name = "rejection_code", length = 40)
    private String rejectionCode;
    @Column(name = "finish_event_id", length = 160)
    private String finishEventId;
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "finish_payload_hash", columnDefinition = "BINARY(32)")
    private byte[] finishPayloadHash;
    @Column(name = "engine_finish_version")
    private Long engineFinishVersion;
    @Column(name = "end_reason", length = 32)
    private String endReason;
    @Column(name = "result_version", nullable = false)
    private long resultVersion;
    @Column(name = "settlement_policy_version", nullable = false)
    private short settlementPolicyVersion;
    @Column(name = "tie_bonus_amount")
    private Long tieBonusAmount;
    @Column(name = "payout_per_winner")
    private Long payoutPerWinner;
    @Column(name = "owner_instance_id", nullable = false, updatable = false, length = 64)
    private String ownerInstanceId;
    @JdbcTypeCode(SqlTypes.BINARY)
    @Column(name = "owner_boot_id", nullable = false, updatable = false, columnDefinition = "BINARY(16)")
    private UUID ownerBootId;
    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant createdAt;
    @Column(name = "reserved_at", columnDefinition = "TIMESTAMP(3)")
    private Instant reservedAt;
    @Column(name = "started_at", columnDefinition = "TIMESTAMP(3)")
    private Instant startedAt;
    @Column(name = "ended_at", columnDefinition = "TIMESTAMP(3)")
    private Instant endedAt;
    @Column(name = "settled_at", columnDefinition = "TIMESTAMP(3)")
    private Instant settledAt;
    @Column(name = "active_table_id", insertable = false, updatable = false, length = 120)
    private String activeTableId;

    protected GameSession() {
    }

    public static GameSession prepare(GameStartCommand command, byte[] fingerprint, String instanceId,
            UUID bootId, Instant now) {
        GameSession session = new GameSession();
        session.startAttemptId = command.startAttemptId();
        session.requestFingerprint = fingerprint.clone();
        session.tableId = command.tableId();
        session.tableVersion = command.tableVersion();
        session.gameCode = command.gameCode();
        session.targetScore = command.targetScore();
        session.participantCount = (short) command.participants().size();
        session.betAmountPerPlayer = command.betAmountPerPlayer();
        session.totalPot = Math.multiplyExact(session.betAmountPerPlayer, session.participantCount);
        session.status = Status.PREPARING;
        session.settlementPolicyVersion = 1;
        session.ownerInstanceId = instanceId;
        session.ownerBootId = bootId;
        session.createdAt = now;
        return session;
    }

    public void reserve(Instant now) {
        requirePreparing();
        status = Status.RESERVED;
        settlementStatus = SettlementStatus.PENDING;
        reservedAt = now;
    }

    public void reject(String code) {
        requirePreparing();
        status = Status.REJECTED;
        rejectionCode = code;
    }

    private void requirePreparing() {
        if (status != Status.PREPARING) {
            throw new IllegalStateException("확정된 경기 시작 결과는 변경할 수 없습니다.");
        }
    }

    public boolean matches(byte[] fingerprint) { return Arrays.equals(requestFingerprint, fingerprint); }
    public long id() { return id; }
    public UUID startAttemptId() { return startAttemptId; }
    public String tableId() { return tableId; }
    public long tableVersion() { return tableVersion; }
    public String gameCode() { return gameCode; }
    public Integer targetScore() { return targetScore; }
    public Status status() { return status; }
    public String rejectionCode() { return rejectionCode; }
    public long betAmountPerPlayer() { return betAmountPerPlayer; }
    public long totalPot() { return totalPot; }
    public int participantCount() { return participantCount; }
    public SettlementStatus settlementStatus() { return settlementStatus; }
    public String endReason() { return endReason; }
    public Instant endedAt() { return endedAt; }
    public Instant reservedAt() { return reservedAt; }
    public Instant startedAt() { return startedAt; }
    public String ownerInstanceId() { return ownerInstanceId; }
    public UUID ownerBootId() { return ownerBootId; }
    public long resultVersion() { return resultVersion; }
    public Long engineFinishVersion() { return engineFinishVersion; }
    public boolean hasFinish() { return finishEventId != null; }

    public boolean ownedBy(String instanceId, UUID bootId) {
        return ownerInstanceId.equals(instanceId) && ownerBootId.equals(bootId);
    }

    public boolean canActivate() {
        return (status == Status.RESERVED || status == Status.RUNNING)
                && settlementStatus == SettlementStatus.PENDING && !hasFinish();
    }

    public void markStarted(Instant now) {
        if (!canActivate() || now.isBefore(reservedAt)) {
            throw new IllegalStateException("경기 활성화 상태를 확인하세요.");
        }
        if (status == Status.RESERVED) {
            status = Status.RUNNING;
            startedAt = now;
        }
    }

    public boolean matchesFinish(String eventId, byte[] hash) {
        return java.util.Objects.equals(finishEventId, eventId) && Arrays.equals(finishPayloadHash, hash);
    }

    public void recordFinish(String eventId, byte[] hash, long engineVersion, String reason, Instant endedAt) {
        recordTerminal(eventId, hash, engineVersion, reason, endedAt, Status.FINISHED);
    }

    public void recordInvalidFinish(String eventId, byte[] hash, long engineVersion, String reason, Instant endedAt) {
        if (!"ABORTED_NO_PLAYERS".equals(reason)) {
            throw new IllegalArgumentException("엔진의 무효 종료 사유를 확인하세요.");
        }
        recordTerminal(eventId, hash, engineVersion, reason, endedAt, Status.INVALID);
    }

    private void recordTerminal(String eventId, byte[] hash, long engineVersion, String reason, Instant endedAt,
            Status terminalStatus) {
        if (hasFinish() || status != Status.RESERVED && status != Status.RUNNING
                || reservedAt == null || endedAt.isBefore(reservedAt)) {
            throw new IllegalStateException("경기 종료 상태를 확인하세요.");
        }
        finishEventId = eventId;
        finishPayloadHash = hash.clone();
        engineFinishVersion = engineVersion;
        endReason = reason;
        this.endedAt = endedAt;
        status = terminalStatus;
        resultVersion = 1;
    }

    public void settle(long bonus, long payoutPerWinner, Instant now) {
        if (status != Status.FINISHED || settlementStatus != SettlementStatus.PENDING) {
            throw new IllegalStateException("경기 정산 상태를 확인하세요.");
        }
        tieBonusAmount = bonus;
        this.payoutPerWinner = payoutPerWinner;
        settlementStatus = SettlementStatus.SETTLED;
        settledAt = now;
        resultVersion = Math.addExact(resultVersion, 1);
    }

    public void completeInvalidation(Instant now) {
        if (status != Status.INVALID || settlementStatus != SettlementStatus.PENDING) {
            throw new IllegalStateException("무효 경기 반환 상태를 확인하세요.");
        }
        tieBonusAmount = 0L;
        payoutPerWinner = 0L;
        settlementStatus = SettlementStatus.SETTLED;
        settledAt = now;
        resultVersion = Math.addExact(resultVersion, 1);
    }

    public enum Status { PREPARING, REJECTED, RESERVED, RUNNING, FINISHED, INVALID }
    public enum SettlementStatus { PENDING, SETTLED }
}
