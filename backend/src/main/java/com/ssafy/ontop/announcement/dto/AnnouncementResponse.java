package com.ssafy.ontop.announcement.dto;

import com.ssafy.ontop.announcement.domain.Announcement;
import java.time.Instant;

public record AnnouncementResponse(String id, String title, String text, boolean published, int displayOrder,
        Instant startsAt, Instant endsAt, long version, Instant updatedAt) {
    public static AnnouncementResponse from(Announcement value) {
        return new AnnouncementResponse(value.getId(), value.getTitle(), value.getText(), value.isPublished(),
                value.getDisplayOrder(), value.getStartsAt(), value.getEndsAt(), value.getVersion(), value.getUpdatedAt());
    }
}
