package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/** Immutable first decision for a v4 idempotent operation. */
@Entity
@Table(name = "bungeoppang_v4_receipts", uniqueConstraints = {
        @UniqueConstraint(name = "uk_bungeoppang_v4_receipt_key",
                columnNames = {"minigame_session_id", "operation", "request_key"}),
        @UniqueConstraint(name = "uk_bungeoppang_v4_accepted_order",
                columnNames = {"minigame_session_id", "accepted_order_id"})
})
public class BungeoppangV4Receipt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "minigame_session_id", nullable = false, updatable = false)
    private long sessionId;
    @Column(nullable = false, length = 16, updatable = false)
    private String operation;
    @Column(name = "request_key", nullable = false, length = 64, updatable = false)
    private String requestKey;
    @Column(name = "request_hash", nullable = false, length = 64, columnDefinition = "CHAR(64)", updatable = false)
    private String requestHash;
    @Column(name = "target_order_id", updatable = false)
    private Long targetOrderId;
    @Column(name = "accepted_order_id", updatable = false)
    private Long acceptedOrderId;
    @Column(nullable = false, length = 16, updatable = false)
    private String outcome;
    @Column(name = "http_status", nullable = false, updatable = false)
    private int httpStatus;
    @Column(name = "response_json", nullable = false, columnDefinition = "MEDIUMTEXT", updatable = false)
    private String responseJson;
    @Column(name = "through_seq", nullable = false, updatable = false)
    private int throughSeq;
    @Column(name = "prefix_hash", nullable = false, length = 64, columnDefinition = "CHAR(64)", updatable = false)
    private String prefixHash;
    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP(3)", updatable = false)
    private Instant createdAt;

    protected BungeoppangV4Receipt() {
    }

    public BungeoppangV4Receipt(long sessionId, String operation, String requestKey, String requestHash,
            Long targetOrderId, Long acceptedOrderId, String outcome, int httpStatus,
            String responseJson, int throughSeq, String prefixHash, Instant createdAt) {
        this.sessionId = sessionId;
        this.operation = operation;
        this.requestKey = requestKey;
        this.requestHash = requestHash;
        this.targetOrderId = targetOrderId;
        this.acceptedOrderId = acceptedOrderId;
        this.outcome = outcome;
        this.httpStatus = httpStatus;
        this.responseJson = responseJson;
        this.throughSeq = throughSeq;
        this.prefixHash = prefixHash;
        this.createdAt = createdAt;
    }

    public long sessionId() { return sessionId; }
    public String operation() { return operation; }
    public String requestKey() { return requestKey; }
    public String requestHash() { return requestHash; }
    public Long targetOrderId() { return targetOrderId; }
    public Long acceptedOrderId() { return acceptedOrderId; }
    public String outcome() { return outcome; }
    public int httpStatus() { return httpStatus; }
    public String responseJson() { return responseJson; }
    public int throughSeq() { return throughSeq; }
    public String prefixHash() { return prefixHash; }
    public Instant createdAt() { return createdAt; }
}
