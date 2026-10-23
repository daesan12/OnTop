package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "minigame_sessions")
public class MinigameSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @Column(name = "minigame_type", nullable = false, length = 40)
    private String minigameType;
    @Column(nullable = false, length = 24)
    private String status;
    @Column
    private Long score;
    @Column(name = "reward_amount", nullable = false)
    private long rewardAmount;
    @Column(name = "started_at", nullable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant startedAt;
    @Column(name = "ended_at", columnDefinition = "TIMESTAMP(3)")
    private Instant endedAt;

    protected MinigameSession() {
    }

    public MinigameSession(long userId, Instant startedAt) {
        this.userId = userId;
        this.minigameType = "BUNGEOPPANG";
        this.status = "PLAYING";
        this.startedAt = startedAt;
    }

    public long id() { return id; }
    public long userId() { return userId; }
    public String minigameType() { return minigameType; }
    public String status() { return status; }
    public Long score() { return score; }
    public long rewardAmount() { return rewardAmount; }
    public Instant startedAt() { return startedAt; }
    public Instant endedAt() { return endedAt; }

    public void complete(long verifiedCount, long reward, Instant endedAt) {
        requirePlaying();
        this.score = verifiedCount;
        this.rewardAmount = reward;
        this.status = "COMPLETED";
        this.endedAt = endedAt;
    }

    public void abandon(Instant endedAt) {
        requirePlaying();
        this.status = "ABANDONED";
        this.endedAt = endedAt;
    }

    private void requirePlaying() {
        if (!status.equals("PLAYING")) {
            throw new IllegalStateException("진행 중인 미니게임만 종료할 수 있습니다.");
        }
    }
}
