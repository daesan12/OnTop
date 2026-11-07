package com.ssafy.ontop.notification.dto;

import java.time.Instant;

public record NotificationDetailResponse(String id, String type, String title, Instant createdAt,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Instant readAt,
        String body,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String feedbackId,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String feedbackText,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String feedbackStatus,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) NotificationRewardResponse reward) {
    public NotificationDetailResponse(String id, String type, String title, Instant createdAt, Instant readAt,
            String body, String feedbackId, String feedbackText, String feedbackStatus) {
        this(id, type, title, createdAt, readAt, body, feedbackId, feedbackText, feedbackStatus, null);
    }
    @Override
    public String toString() { return "NotificationDetail[redacted]"; }
}
