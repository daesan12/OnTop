package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 시작 재요청을 같은 세션으로 연결하는 내부 영수증. 플레이 결과·보상 근거가 아니다. */
@Entity
@Table(name = "minigame_start_requests")
public class MinigameStartRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(name = "request_key", nullable = false, length = 64, updatable = false)
    private String requestKey;
    @Column(name = "minigame_session_id", nullable = false, updatable = false)
    private long sessionId;

    protected MinigameStartRequest() {
    }

    public MinigameStartRequest(long userId, String requestKey, long sessionId) {
        this.userId = userId;
        this.requestKey = requestKey;
        this.sessionId = sessionId;
    }

    public long sessionId() { return sessionId; }
}
