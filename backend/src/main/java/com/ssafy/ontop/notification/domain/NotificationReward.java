package com.ssafy.ontop.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** 알림을 읽는 것과 실제 재화를 수령하는 것은 별개의 상태다. */
@Entity
@Table(name = "notification_rewards")
public class NotificationReward {
    public enum Kind { COIN, GACHA_TICKET }

    @Id
    @Column(length = 36, columnDefinition = "char(36)")
    private String id;
    @Column(name = "notification_id", nullable = false)
    private long notificationId;
    @Column(name = "administrator_id")
    private Long administratorId;
    @Column(nullable = false, length = 20)
    private String kind;
    @Column(nullable = false)
    private long amount;
    @Column(nullable = false, length = 1000)
    private String body;
    @Column(name = "claimed_at")
    private Instant claimedAt;
    @Column(name = "balance_after")
    private Long balanceAfter;
    @Column(name = "tickets_after")
    private Long ticketsAfter;

    protected NotificationReward() { }

    public NotificationReward(String id, long notificationId, long administratorId, Kind kind,
            long amount, String body) {
        this.id = id;
        this.notificationId = notificationId;
        this.administratorId = administratorId;
        this.kind = kind.name();
        this.amount = amount;
        this.body = body;
    }

    public String id() { return id; }
    public long notificationId() { return notificationId; }
    public Long administratorId() { return administratorId; }
    public Kind kind() { return Kind.valueOf(kind); }
    public long amount() { return amount; }
    public String body() { return body; }
    public Instant claimedAt() { return claimedAt; }
    public Long balanceAfter() { return balanceAfter; }
    public Long ticketsAfter() { return ticketsAfter; }

    public void claim(Instant now, Long balance, Long tickets) {
        if (claimedAt != null) { throw new IllegalStateException("이미 수령한 보상입니다."); }
        claimedAt = now;
        balanceAfter = balance;
        ticketsAfter = tickets;
    }

    @Override
    public String toString() { return "NotificationReward[redacted]"; }
}
