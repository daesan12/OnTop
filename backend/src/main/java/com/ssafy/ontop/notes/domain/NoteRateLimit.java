package com.ssafy.ontop.notes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** 요청/메모 ID와 연결하지 않는 간격 제한 정보. */
@Entity
@Table(name = "anonymous_note_rates")
public class NoteRateLimit {
    @Id
    @Column(name = "subject_digest", length = 64, columnDefinition = "char(64)")
    private String subjectDigest;
    @Column(name = "read_after")
    private Instant readAfter;
    @Column(name = "write_after")
    private Instant writeAfter;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected NoteRateLimit() {
    }

    public NoteRateLimit(String digest, Instant now) {
        subjectDigest = digest;
        expiresAt = now.plusSeconds(86400);
    }

    public Instant readAfter() { return readAfter; }
    public Instant writeAfter() { return writeAfter; }
    public void read(Instant now) { readAfter = now.plusSeconds(1); expiresAt = now.plusSeconds(86400); }
    public void write(Instant now) { writeAfter = now.plusSeconds(15); expiresAt = now.plusSeconds(86400); }
}
