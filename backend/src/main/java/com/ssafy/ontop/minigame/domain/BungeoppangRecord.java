package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** ERD의 공통 세션을 유지하고 붕어빵 전용 재생 자료와 최초 응답만 분리한다. */
@Entity
@Table(name = "bungeoppang_records")
public class BungeoppangRecord {
    @Id
    @Column(name = "minigame_session_id")
    private long sessionId;
    @Column(name = "rules_version", nullable = false, length = 16)
    private String rulesVersion;
    @Column(nullable = false, columnDefinition = "TEXT")
    private String heats;
    @Column(name = "is_first_game", nullable = false)
    private boolean firstGame;
    @Column(name = "submission", columnDefinition = "MEDIUMTEXT")
    private String submission;
    @Column(name = "result_json", columnDefinition = "TEXT")
    private String result;
    @Column(name = "rejection_detail", length = 64)
    private String rejectionDetail;
    @Column(name = "rejection_index")
    private Integer rejectionIndex;

    protected BungeoppangRecord() { }

    public BungeoppangRecord(long sessionId, String heats, boolean firstGame) {
        this.sessionId = sessionId;
        this.rulesVersion = "v2";
        this.heats = heats;
        this.firstGame = firstGame;
    }

    public String rulesVersion() { return rulesVersion; }
    public String heats() { return heats; }
    public boolean firstGame() { return firstGame; }
    public String result() { return result; }
    public String rejectionDetail() { return rejectionDetail; }
    public Integer rejectionIndex() { return rejectionIndex; }
    public void accept(String submission, String result) { this.submission = submission; this.result = result; }
    public void reject(String submission, String detail, int index) {
        this.submission = submission;
        this.rejectionDetail = detail;
        this.rejectionIndex = index;
    }
}
