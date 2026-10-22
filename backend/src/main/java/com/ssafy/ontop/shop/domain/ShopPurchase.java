package com.ssafy.ontop.shop.domain;

import com.ssafy.ontop.shop.dto.PurchaseResponse;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity(name = "ShopPurchase")
@Table(name = "shop_purchases")
public class ShopPurchase {
    @Id @Column(name = "purchase_id", length = 36, columnDefinition = "CHAR(36)")
    private String purchaseId;
    @Column(name = "user_id", nullable = false)
    private long userId;
    @Column(name = "request_key", nullable = false, length = 64)
    private String requestKey;
    @Column(name = "item_id", nullable = false)
    private long itemId;
    @Column(nullable = false)
    private int quantity;
    @Column(name = "unit_price", nullable = false)
    private long unitPrice;
    @Column(name = "total_price", nullable = false)
    private long totalPrice;
    @Column(name = "balance_after", nullable = false)
    private long balanceAfter;
    @Column(name = "user_item_id", nullable = false)
    private long userItemId;
    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP(3)")
    private Instant createdAt;

    protected ShopPurchase() {
    }

    public ShopPurchase(long userId, String key, PurchaseResponse purchase) {
        this.userId = userId;
        requestKey = key;
        purchaseId = purchase.purchaseId();
        itemId = purchase.itemId();
        quantity = purchase.quantity();
        unitPrice = purchase.unitPrice();
        totalPrice = purchase.totalPrice();
        balanceAfter = purchase.balanceAfter();
        userItemId = purchase.userItemId();
        createdAt = Instant.now();
    }

    public PurchaseResponse toPurchase() {
        return new PurchaseResponse(purchaseId, itemId, quantity, unitPrice, totalPrice, balanceAfter, userItemId);
    }
}
