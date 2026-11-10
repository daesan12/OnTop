package com.ssafy.ontop.notification.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@io.swagger.v3.oas.annotations.media.Schema(requiredProperties = {"items", "nextCursor", "unreadCount"})
public record NotificationListResponse(List<Entry> items,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String nextCursor, long unreadCount) {
    @io.swagger.v3.oas.annotations.media.Schema(name = "PersonalNotificationEntry")
    public record Entry(String id, String type, String title, Instant createdAt,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Instant readAt,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) NotificationRewardResponse reward,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) LocalDate eventWeekStartDate) {
        public Entry(String id, String type, String title, Instant createdAt, Instant readAt) {
            this(id, type, title, createdAt, readAt, null, null);
        }
    }
}
