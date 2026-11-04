package com.ssafy.ontop.announcement.dto;

import java.time.Instant;
import java.util.List;

public record PublicAnnouncementsResponse(Instant serverTime, Instant refreshAt, List<Item> announcements) {
    public record Item(String id, String text, Instant endsAt, long version) { }
}
