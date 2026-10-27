package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

/** A v4 round's immutable rule source and mutable approved checkpoint boundary. */
@Entity
@Table(name = "bungeoppang_v4_rounds")
public class BungeoppangV4Round {
    @Id
    @Column(name = "minigame_session_id")
    private long sessionId;
    @Column(name = "config_version", nullable = false, length = 32, updatable = false)
    private String configVersion;
    @Column(name = "config_json", nullable = false, columnDefinition = "TEXT", updatable = false)
    private String configJson;
    @Column(name = "issued_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant issuedAt;
    @Column(name = "countdown_starts_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant countdownStartsAt;
    @Column(name = "play_starts_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant playStartsAt;
    @Column(name = "play_ends_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant playEndsAt;
    @Column(name = "submit_deadline", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant submitDeadline;
    @Column(name = "expires_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant expiresAt;
    @Column(nullable = false)
    private long revision;
    @Column(name = "approved_through_seq", nullable = false)
    private int approvedThroughSeq;
    @Column(name = "approved_prefix_hash", nullable = false, length = 64, columnDefinition = "CHAR(64)")
    private String approvedPrefixHash;
    @Column(name = "checkpoint_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String checkpointJson;
    @Column(name = "terminal_reason", length = 32)
    private String terminalReason;
    @Column(name = "final_request_hash", length = 64, columnDefinition = "CHAR(64)")
    private String finalRequestHash;
    @Column(name = "final_through_seq")
    private Integer finalThroughSeq;
    @Column(name = "final_prefix_hash", length = 64, columnDefinition = "CHAR(64)")
    private String finalPrefixHash;
    @Column(name = "settled_at", columnDefinition = "TIMESTAMP(3)")
    private Instant settledAt;
    @Column(name = "reward_date")
    private LocalDate rewardDate;

    protected BungeoppangV4Round() {
    }

    public BungeoppangV4Round(long sessionId, String configVersion, String configJson, Instant issuedAt,
            Instant countdownStartsAt, Instant playStartsAt, Instant playEndsAt, Instant submitDeadline,
            Instant expiresAt, String approvedPrefixHash, String checkpointJson) {
        this.sessionId = sessionId;
        this.configVersion = configVersion;
        this.configJson = configJson;
        this.issuedAt = issuedAt;
        this.countdownStartsAt = countdownStartsAt;
        this.playStartsAt = playStartsAt;
        this.playEndsAt = playEndsAt;
        this.submitDeadline = submitDeadline;
        this.expiresAt = expiresAt;
        this.revision = 0;
        this.approvedThroughSeq = 0;
        this.approvedPrefixHash = approvedPrefixHash;
        this.checkpointJson = checkpointJson;
    }

    public long sessionId() { return sessionId; }
    public String configVersion() { return configVersion; }
    public String configJson() { return configJson; }
    public Instant issuedAt() { return issuedAt; }
    public Instant countdownStartsAt() { return countdownStartsAt; }
    public Instant playStartsAt() { return playStartsAt; }
    public Instant playEndsAt() { return playEndsAt; }
    public Instant submitDeadline() { return submitDeadline; }
    public Instant expiresAt() { return expiresAt; }
    public long revision() { return revision; }
    public int approvedThroughSeq() { return approvedThroughSeq; }
    public String approvedPrefixHash() { return approvedPrefixHash; }
    public String checkpointJson() { return checkpointJson; }
    public String terminalReason() { return terminalReason; }
    public String finalRequestHash() { return finalRequestHash; }
    public Integer finalThroughSeq() { return finalThroughSeq; }
    public String finalPrefixHash() { return finalPrefixHash; }
    public Instant settledAt() { return settledAt; }
    public LocalDate rewardDate() { return rewardDate; }

    public void approve(int throughSeq, String prefixHash, String checkpointJson) {
        if (terminalReason != null || throughSeq <= approvedThroughSeq) {
            throw new IllegalStateException("종료되었거나 이전인 승인 경계입니다.");
        }
        revision = Math.addExact(revision, 1);
        approvedThroughSeq = throughSeq;
        approvedPrefixHash = prefixHash;
        this.checkpointJson = checkpointJson;
    }

    public void terminate(String reason) {
        if (terminalReason == null) {
            terminalReason = reason;
        }
    }

    public void settle(String requestHash, int throughSeq, String prefixHash, Instant settledAt,
            LocalDate rewardDate) {
        if (terminalReason != null || finalRequestHash != null || throughSeq < approvedThroughSeq) {
            throw new IllegalStateException("이미 종료되었거나 승인 경계보다 이전인 최종 결과입니다.");
        }
        finalRequestHash = requestHash;
        finalThroughSeq = throughSeq;
        finalPrefixHash = prefixHash;
        this.settledAt = settledAt;
        this.rewardDate = rewardDate;
        terminalReason = "VERIFIED";
    }
}
