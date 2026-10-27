package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Durable approved action prefix. A missing row means the Story 1 empty prefix. */
@Entity
@Table(name = "bungeoppang_v4_progress")
public class BungeoppangV4Progress {
    @Id
    @Column(name = "minigame_session_id")
    private long sessionId;

    @Column(name = "accepted_log_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String acceptedLogJson;

    protected BungeoppangV4Progress() {
    }

    public BungeoppangV4Progress(long sessionId, String acceptedLogJson) {
        this.sessionId = sessionId;
        this.acceptedLogJson = acceptedLogJson;
    }

    public long sessionId() { return sessionId; }
    public String acceptedLogJson() { return acceptedLogJson; }

    public void replace(String acceptedLogJson) {
        this.acceptedLogJson = acceptedLogJson;
    }
}
