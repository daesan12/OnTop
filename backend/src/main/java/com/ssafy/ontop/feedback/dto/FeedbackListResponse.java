package com.ssafy.ontop.feedback.dto;

import java.time.Instant;
import java.util.List;

public record FeedbackListResponse(List<Entry> items, String nextCursor) {
    public record Entry(String receiptId, Long authorUserId, String channelId, String text, Instant acceptedAt) {
        @Override
        public String toString() { return "FeedbackEntry[redacted]"; }
    }

    @Override
    public String toString() { return "FeedbackList[redacted]"; }
}
