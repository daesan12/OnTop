package com.ssafy.ontop.item.domain;

import com.ssafy.ontop.shop.dto.ItemResponse;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity(name = "Item")
@Table(name = "items")
public class Item {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "item_code", nullable = false, length = 50)
    private String itemCode;
    @Column(nullable = false, length = 100)
    private String name;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "item_type", nullable = false, length = 20)
    private ItemType itemType;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "equip_slot", length = 20)
    private EquipSlot equipSlot;
    @Column(nullable = false)
    private long price;
    @Column(name = "image_key", nullable = false)
    private String imageKey;
    @Column(name = "is_for_sale", nullable = false)
    private boolean forSale;

    protected Item() {
    }

    public ItemResponse toItem() {
        return new ItemResponse(id, itemCode, name, itemType, equipSlot, price, imageKey);
    }

    public boolean isForSale() {
        return forSale;
    }
}
