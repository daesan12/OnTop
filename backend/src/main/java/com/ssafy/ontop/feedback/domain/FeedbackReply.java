package com.ssafy.ontop.feedback.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "feedback_replies")
public class FeedbackReply {
    @Id
    @Column(length = 36, columnDefinition = "char(36)")
    private String id;
    @Column(name = "feedback_id", nullable = false)
    private long feedbackId;
    @Column(name = "administrator_id")
    private Long administratorId;
    @Column(nullable = false, length = 2000)
    private String body;
    @Column(name = "resulting_status", nullable = false, length = 20)
    private String resultingStatus;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected FeedbackReply() { }

    public FeedbackReply(String id, long feedbackId, long administratorId, String body,
            FeedbackMessage.Status status, Instant now) {
        this.id = id;
        this.feedbackId = feedbackId;
        this.administratorId = administratorId;
        this.body = body;
        this.resultingStatus = status.name();
        this.createdAt = now;
    }

    public String id() { return id; }
    public long feedbackId() { return feedbackId; }
    public String body() { return body; }
    public Long administratorId() { return administratorId; }
    public String resultingStatus() { return resultingStatus; }
    public Instant createdAt() { return createdAt; }

    @Override
    public String toString() { return "FeedbackReply[redacted]"; }
}
