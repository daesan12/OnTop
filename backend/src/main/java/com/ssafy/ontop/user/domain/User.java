package com.ssafy.ontop.user.domain;

import com.ssafy.ontop.user.validation.NicknameValidator;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(name = "uk_users_login_provider_provider_user_id",
                columnNames = {"login_provider", "provider_user_id"}),
        @UniqueConstraint(name = "uk_users_nickname", columnNames = "nickname")
})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "login_provider", nullable = false, length = 20, updatable = false)
    private LoginProvider loginProvider;

    @Column(name = "provider_user_id", nullable = false, length = 255, updatable = false)
    private String providerUserId;

    @Column(name = "nickname", nullable = false, length = 8)
    private String nickname;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "character_gender", nullable = false, length = 10, updatable = false)
    private CharacterGender characterGender;

    @Column(name = "created_at", nullable = false, updatable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant updatedAt;

    @Column(name = "deleted_at", columnDefinition = "TIMESTAMP(3)")
    private Instant deletedAt;

    protected User() {
    }

    public User(LoginProvider loginProvider, String providerUserId, String nickname, CharacterGender characterGender) {
        this.loginProvider = Objects.requireNonNull(loginProvider);
        this.providerUserId = Objects.requireNonNull(providerUserId);
        this.nickname = Objects.requireNonNull(nickname);
        this.characterGender = Objects.requireNonNull(characterGender);
    }

    @PrePersist
    void initializeTimestamps() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void updateTimestamp() {
        updatedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    public boolean restoreWithinRecoveryPeriod(Instant now) {
        Objects.requireNonNull(now);
        if (deletedAt == null || now.isBefore(deletedAt) || now.isAfter(deletedAt.plus(Duration.ofDays(7)))) {
            return false;
        }
        deletedAt = null;
        return true;
    }

    public Long getId() {
        return id;
    }

    public void changeNickname(String nickname) {
        NicknameValidator.validate(nickname);
        this.nickname = nickname;
    }

    public void deactivate(Instant now) {
        if (deletedAt == null) {
            deletedAt = Objects.requireNonNull(now).truncatedTo(ChronoUnit.MILLIS);
        }
    }

    public LoginProvider getLoginProvider() {
        return loginProvider;
    }

    public String getProviderUserId() {
        return providerUserId;
    }

    public String getNickname() {
        return nickname;
    }

    public CharacterGender getCharacterGender() {
        return characterGender;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
