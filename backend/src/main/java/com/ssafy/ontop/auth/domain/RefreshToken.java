package com.ssafy.ontop.auth.domain;

import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    private User user;

    @Column(name = "session_id", nullable = false, length = 36, updatable = false)
    private String sessionId;

    @Column(name = "token_hash", nullable = false, length = 64, unique = true, updatable = false)
    private String tokenHash;

    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant expiresAt;

    @Column(name = "revoked_at", columnDefinition = "TIMESTAMP(3)")
    private Instant revokedAt;

    protected RefreshToken() {
    }

    public RefreshToken(User user, String sessionId, String tokenHash, Instant createdAt, Instant expiresAt) {
        this.user = Objects.requireNonNull(user);
        this.sessionId = UUID.fromString(sessionId).toString();
        if (tokenHash == null || !tokenHash.matches("[0-9a-f]{64}") || !expiresAt.isAfter(createdAt)) {
            throw new IllegalArgumentException("Refresh 저장 정보가 유효하지 않습니다.");
        }
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public boolean isUsableAt(Instant now) {
        return revokedAt == null && !createdAt.isAfter(now) && expiresAt.isAfter(now);
    }

    public void revoke(Instant now) {
        if (revokedAt == null) {
            revokedAt = Objects.requireNonNull(now);
        }
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return user.getId();
    }

    public String getSessionId() {
        return sessionId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    @Override
    public String toString() {
        return "RefreshToken[redacted]";
    }
}
