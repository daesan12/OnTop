package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Entity
@Table(name = "bungeoppang_v4_orders", uniqueConstraints = {
        @UniqueConstraint(name = "uk_bungeoppang_v4_order_id", columnNames = {"minigame_session_id", "order_id"}),
        @UniqueConstraint(name = "uk_bungeoppang_v4_order_index", columnNames = {"minigame_session_id", "order_index"})
})
public class BungeoppangV4Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "minigame_session_id", nullable = false, updatable = false)
    private long sessionId;
    @Column(name = "order_id", nullable = false, updatable = false)
    private long orderId;
    @Column(name = "order_index", nullable = false, updatable = false)
    private int orderIndex;
    @Column(nullable = false, updatable = false)
    private int bean;
    @Column(nullable = false, updatable = false)
    private int custard;
    @Column(nullable = false, updatable = false)
    private int pizza;
    @Column(nullable = false, updatable = false)
    private int chocolate;
    @Column(name = "issued_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant issuedAt;

    protected BungeoppangV4Order() {
    }

    public BungeoppangV4Order(long sessionId, long orderId, int orderIndex, int bean, int custard,
            int pizza, int chocolate, Instant issuedAt) {
        this.sessionId = sessionId;
        this.orderId = orderId;
        this.orderIndex = orderIndex;
        this.bean = bean;
        this.custard = custard;
        this.pizza = pizza;
        this.chocolate = chocolate;
        this.issuedAt = issuedAt;
    }

    public long sessionId() { return sessionId; }
    public long orderId() { return orderId; }
    public int orderIndex() { return orderIndex; }
    public int bean() { return bean; }
    public int custard() { return custard; }
    public int pizza() { return pizza; }
    public int chocolate() { return chocolate; }
    public Instant issuedAt() { return issuedAt; }
}
