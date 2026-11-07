package com.ssafy.ontop.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "personal_notifications")
public class PersonalNotification {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false)
    private long userId;
    @Column(name = "reply_id", length = 36, columnDefinition = "char(36)")
    private String replyId;
    @Column(nullable = false, length = 32)
    private String type = "FEEDBACK_REPLY";
    @Column(nullable = false, length = 100)
    private String title = "운영진에게 메시지가 도착했어요";
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Column(name = "read_at")
    private Instant readAt;

    protected PersonalNotification() { }

    public PersonalNotification(long userId, String replyId, Instant now, Instant expiresAt) {
        this.userId = userId;
        this.replyId = replyId;
        this.createdAt = now;
        this.expiresAt = expiresAt;
    }

    public static PersonalNotification reward(long userId, String title, Instant now, Instant expiresAt) {
        var notification = new PersonalNotification(userId, null, now, expiresAt);
        notification.type = "REWARD";
        notification.title = title;
        return notification;
    }

    public Long id() { return id; }
    public long userId() { return userId; }
    public String replyId() { return replyId; }
    public String type() { return type; }
    public String title() { return title; }
    public Instant createdAt() { return createdAt; }
    public Instant expiresAt() { return expiresAt; }
    public Instant readAt() { return readAt; }
    public void read(Instant now) {
        if (readAt == null) { readAt = now; }
    }

    @Override
    public String toString() { return "PersonalNotification[redacted]"; }
}
