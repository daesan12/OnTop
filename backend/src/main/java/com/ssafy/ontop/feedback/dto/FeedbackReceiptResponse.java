package com.ssafy.ontop.feedback.dto;

import java.time.Instant;

public record FeedbackReceiptResponse(String receiptId, Instant acceptedAt, Instant nextAllowedAt) {
}
