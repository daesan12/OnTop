package com.ssafy.ontop.feedback.dto;

import java.time.Instant;
import java.util.List;

public record FeedbackListResponse(List<Entry> items, String nextCursor) {
    public record Entry(String receiptId, Long authorUserId, String channelId, String text, Instant acceptedAt,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String authorNickname,
            String status, long version, @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Reply latestReply) {
        public Entry(String receiptId, Long authorUserId, String channelId, String text, Instant acceptedAt) {
            this(receiptId, authorUserId, channelId, text, acceptedAt, null, "RECEIVED", 0, null);
        }
        @Override
        public String toString() { return "FeedbackEntry[redacted]"; }
    }

    public record Reply(String id, String text, Instant createdAt) {
        @Override
        public String toString() { return "FeedbackReply[redacted]"; }
    }

    @Override
    public String toString() { return "FeedbackList[redacted]"; }
}
