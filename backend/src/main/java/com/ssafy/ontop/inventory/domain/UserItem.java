package com.ssafy.ontop.inventory.domain;

import com.ssafy.ontop.item.domain.Item;
import com.ssafy.ontop.shop.ShopModels;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity(name = "UserItem")
@Table(name = "user_items")
public class UserItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false, updatable = false)
    private Item item;
    @Column(nullable = false)
    private int quantity;
    @Column(name = "is_equipped", nullable = false)
    private boolean equipped;

    protected UserItem() { }
    public UserItem(long userId, Item item, int quantity) {
        this.userId = userId; this.item = item; this.quantity = quantity;
    }
    public long id() { return id; }
    public int quantity() { return quantity; }
    public void quantity(int value) { quantity = value; }
    public void equipped(boolean value) { equipped = value; }
    public ShopModels.OwnedItem toOwnedItem() {
        return new ShopModels.OwnedItem(id, item.toItem(), quantity, equipped);
    }
}
