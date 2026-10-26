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
        session.betAmountPerPlayer = 1;
        session.totalPot = session.participantCount;
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

    public enum Status { PREPARING, REJECTED, RESERVED, RUNNING, FINISHED, INVALID }
    public enum SettlementStatus { PENDING, SETTLED }
}
