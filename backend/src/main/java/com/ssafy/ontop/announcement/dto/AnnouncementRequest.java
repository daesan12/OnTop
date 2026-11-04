package com.ssafy.ontop.announcement.dto;

import java.time.Instant;

public record AnnouncementRequest(String title, String text, boolean published, int displayOrder,
        Instant startsAt, Instant endsAt, long expectedVersion) {
    public void validate() {
        if (title == null || title.isBlank() || title.strip().length() > 80
                || text == null || text.isBlank() || text.strip().length() > 1000
                || displayOrder < 0 || displayOrder > 9999 || expectedVersion < 0
                || startsAt != null && endsAt != null && !endsAt.isAfter(startsAt)) {
            throw new IllegalArgumentException("제목 1~80자, 내용 1~1000자, 표시 순서와 게시 기간을 확인해주세요.");
        }
    }
}
