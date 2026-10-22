package com.ssafy.ontop.shop.persistence;

import com.ssafy.ontop.shop.ShopModels;
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

@Entity(name = "ShopItem")
@Table(name = "items")
public class ShopItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "item_code", nullable = false, length = 50)
    private String itemCode;
    @Column(nullable = false, length = 100)
    private String name;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "item_type", nullable = false, length = 20)
    private ShopModels.ItemType itemType;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "equip_slot", length = 20)
    private ShopModels.EquipSlot equipSlot;
    @Column(nullable = false)
    private long price;
    @Column(name = "image_key", nullable = false)
    private String imageKey;
    @Column(name = "is_for_sale", nullable = false)
    private boolean forSale;

    protected ShopItem() { }

    public ShopModels.Item toItem() {
        return new ShopModels.Item(id, itemCode, name, itemType, equipSlot, price, imageKey);
    }
    public boolean forSale() { return forSale; }
}
