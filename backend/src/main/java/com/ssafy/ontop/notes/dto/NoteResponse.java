package com.ssafy.ontop.notes.dto;

import com.ssafy.ontop.notes.domain.AnonymousNote;
import java.time.Instant;

public record NoteResponse(String id, String text, Instant createdAt, String category) {
    public NoteResponse(String id, String text, Instant createdAt) { this(id, text, createdAt, "free"); }
    public static NoteResponse from(AnonymousNote note) {
        return new NoteResponse(note.id().toString(), note.body(), note.createdAt(), note.category());
    }

    @Override
    public String toString() { return "NoteResponse[redacted]"; }
}
