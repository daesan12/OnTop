package com.ssafy.ontop.feedback.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "feedback_messages")
public class FeedbackMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id")
    private Long userId;
    @Column(name = "request_key", length = 64)
    private String requestKey;
    @Column(name = "channel_id", nullable = false, length = 64)
    private String channelId;
    @Column(name = "body", nullable = false, length = 600)
    private String body;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected FeedbackMessage() {
    }

    public FeedbackMessage(long userId, String requestKey, String channelId, FeedbackText text, Instant now) {
        this.userId = userId;
        this.requestKey = requestKey;
        this.channelId = channelId;
        this.body = text.value();
        this.createdAt = now;
    }

    public Long id() { return id; }
    public Long userId() { return userId; }
    public String channelId() { return channelId; }
    public String body() { return body; }
    public Instant createdAt() { return createdAt; }

    @Override
    public String toString() { return "FeedbackMessage[redacted]"; }
}
