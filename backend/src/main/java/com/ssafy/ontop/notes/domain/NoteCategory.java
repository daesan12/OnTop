package com.ssafy.ontop.notes.domain;

import java.util.Set;

public record NoteCategory(String value) {
    public static final NoteCategory FREE = new NoteCategory("free");
    public NoteCategory {
        if (value == null || !Set.of("daily", "cheer", "worry", "recommend", "free").contains(value)) {
            throw new IllegalArgumentException("메모 주제를 확인해주세요.");
        }
    }
}
