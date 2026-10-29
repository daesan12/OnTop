package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/** A server-issued v5 customer order. Opening orders use availableAfterSeq 0. */
@Entity
@Table(name = "bungeoppang_v5_orders", uniqueConstraints = {
        @UniqueConstraint(name = "uk_bungeoppang_v5_order_id", columnNames = {"minigame_session_id", "order_id"}),
        @UniqueConstraint(name = "uk_bungeoppang_v5_order_slot",
                columnNames = {"minigame_session_id", "available_after_seq", "customer_slot"})
})
public class BungeoppangV5Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "minigame_session_id", nullable = false, updatable = false)
    private long sessionId;
    @Column(name = "order_id", nullable = false, updatable = false)
    private long orderId;
    @Column(name = "customer_slot", nullable = false, updatable = false)
    private int customerSlot;
    @Column(name = "available_after_seq", nullable = false, updatable = false)
    private int availableAfterSeq;
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

    protected BungeoppangV5Order() {
    }

    public BungeoppangV5Order(long sessionId, long orderId, int customerSlot, int availableAfterSeq, int bean,
            int custard, int pizza, int chocolate, Instant issuedAt) {
        this.sessionId = sessionId;
        this.orderId = orderId;
        this.customerSlot = customerSlot;
        this.availableAfterSeq = availableAfterSeq;
        this.bean = bean;
        this.custard = custard;
        this.pizza = pizza;
        this.chocolate = chocolate;
        this.issuedAt = issuedAt;
    }

    public long sessionId() { return sessionId; }
    public long orderId() { return orderId; }
    public int customerSlot() { return customerSlot; }
    public int availableAfterSeq() { return availableAfterSeq; }
    public int bean() { return bean; }
    public int custard() { return custard; }
    public int pizza() { return pizza; }
    public int chocolate() { return chocolate; }
    public Instant issuedAt() { return issuedAt; }
}
