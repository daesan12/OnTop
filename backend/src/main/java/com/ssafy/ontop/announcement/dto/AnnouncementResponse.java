package com.ssafy.ontop.announcement.dto;

import com.ssafy.ontop.announcement.domain.Announcement;
import java.time.Instant;
import io.swagger.v3.oas.annotations.media.Schema;

public record AnnouncementResponse(String id, String title, String text, boolean published, int displayOrder,
        @Schema(nullable = true) Instant startsAt, @Schema(nullable = true) Instant endsAt, long version, Instant updatedAt) {
    public static AnnouncementResponse from(Announcement value) {
        return new AnnouncementResponse(value.getId(), value.getTitle(), value.getText(), value.isPublished(),
                value.getDisplayOrder(), value.getStartsAt(), value.getEndsAt(), value.getVersion(), value.getUpdatedAt());
    }
}
