package com.ssafy.ontop.notification.dto;

import java.time.Instant;

public record NotificationDetailResponse(String id, String type, String title, Instant createdAt,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Instant readAt,
        String body, String feedbackId, String feedbackText, String feedbackStatus) {
    @Override
    public String toString() { return "NotificationDetail[redacted]"; }
}
