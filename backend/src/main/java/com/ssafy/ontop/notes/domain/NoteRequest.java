package com.ssafy.ontop.notes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** 재시도 전용 메타데이터. 회원 ID·본문·원래 요청 키는 보관하지 않는다. */
@Entity
@Table(name = "anonymous_note_requests")
public class NoteRequest {
    @Id
    @Column(name = "request_digest", length = 64, columnDefinition = "char(64)")
    private String requestDigest;
    @Column(name = "body_digest", nullable = false, length = 64, columnDefinition = "char(64)")
    private String bodyDigest;
    @Column(name = "note_id", nullable = false)
    private Long noteId;
    @Column(name = "accepted_at", nullable = false)
    private Instant acceptedAt;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected NoteRequest() {
    }

    public NoteRequest(String requestDigest, String bodyDigest, Long noteId, Instant now, Instant expiresAt) {
        this.requestDigest = requestDigest;
        this.bodyDigest = bodyDigest;
        this.noteId = noteId;
        this.acceptedAt = now;
        this.expiresAt = expiresAt;
    }

    public String bodyDigest() { return bodyDigest; }
    public Long noteId() { return noteId; }
    public Instant acceptedAt() { return acceptedAt; }
    public Instant expiresAt() { return expiresAt; }
}
