package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

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

    public void terminate(String reason) {
        if (terminalReason == null) {
            terminalReason = reason;
        }
    }
}
