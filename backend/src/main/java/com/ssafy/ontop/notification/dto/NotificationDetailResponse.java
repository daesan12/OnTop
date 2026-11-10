package com.ssafy.ontop.notification.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record NotificationDetailResponse(String id, String type, String title, Instant createdAt,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Instant readAt,
        String body,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String feedbackId,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String feedbackText,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String feedbackStatus,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) NotificationRewardResponse reward,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) EventWinnings event) {
    public NotificationDetailResponse(String id, String type, String title, Instant createdAt, Instant readAt,
            String body, String feedbackId, String feedbackText, String feedbackStatus) {
        this(id, type, title, createdAt, readAt, body, feedbackId, feedbackText, feedbackStatus, null, null);
    }
    public NotificationDetailResponse(String id, String type, String title, Instant createdAt, Instant readAt,
            String body, String feedbackId, String feedbackText, String feedbackStatus,
            NotificationRewardResponse reward) {
        this(id, type, title, createdAt, readAt, body, feedbackId, feedbackText, feedbackStatus, reward, null);
    }
    @io.swagger.v3.oas.annotations.media.Schema(name = "EventWinnerNotificationDetails")
    public record EventWinnings(LocalDate weekStartDate, List<Award> awards, String contactStatus,
            boolean contactEdited, Instant submissionDeadline, boolean allPrizesDelivered,
            boolean contactActionRequired, boolean contactEditable) {}
    @io.swagger.v3.oas.annotations.media.Schema(name = "EventWinnerNotificationAward")
    public record Award(long winnerId, String eventType, int place, String prizeName,
            String deliveryStatus) {}
    @Override
    public String toString() { return "NotificationDetail[redacted]"; }
}
