package com.ssafy.ontop.notes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** 공개 기록에는 작성자·채널·요청 키를 저장하지 않는다. */
@Entity
@Table(name = "anonymous_notes")
public class AnonymousNote {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "body", nullable = false, length = 300)
    private String body;
    @Column(nullable = false, length = 16)
    private String category = "free";
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AnonymousNote() {
    }

    public AnonymousNote(NoteText text, Instant now) {
        this(text, NoteCategory.FREE, now);
    }

    public AnonymousNote(NoteText text, NoteCategory category, Instant now) {
        body = text.value();
        this.category = category.value();
        createdAt = now;
    }

    public Long id() { return id; }
    public String body() { return body; }
    public String category() { return category; }
    public Instant createdAt() { return createdAt; }

    @Override
    public String toString() { return "AnonymousNote[redacted]"; }
}
