package com.ssafy.ontop.notes.dto;

import com.ssafy.ontop.notes.domain.AnonymousNote;
import java.time.Instant;

public record NoteResponse(String id, String text, Instant createdAt) {
    public static NoteResponse from(AnonymousNote note) {
        return new NoteResponse(note.id().toString(), note.body(), note.createdAt());
    }

    @Override
    public String toString() { return "NoteResponse[redacted]"; }
}
