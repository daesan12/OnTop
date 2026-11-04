package com.ssafy.ontop.announcement.dto;

import java.time.Instant;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record PublicAnnouncementsResponse(Instant serverTime, Instant refreshAt, List<Item> announcements) {
    @Schema(name = "PublicAnnouncement")
    public record Item(String id, String text, @Schema(nullable = true) Instant endsAt, long version) { }
}
