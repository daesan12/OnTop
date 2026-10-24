package com.ssafy.ontop.notes.dto;

import java.time.Instant;

public record NoteReceiptResponse(NoteResponse note, Instant nextAllowedAt) {
}
