package com.ssafy.ontop.shop;

import java.util.List;

public final class ShopModels {
    private ShopModels() { }

    public enum ItemType { EQUIPMENT, CONSUMABLE }
    public enum EquipSlot { HAIR, FACE, TOP, BOTTOM, SHOES }
    public enum DuplicateEquipmentPolicy { REJECT, STACK }

    public record Item(long itemId, String itemCode, String name, ItemType itemType,
                       EquipSlot equipSlot, long price, String imageKey) { }
    public record OwnedItem(long userItemId, Item item, int quantity, boolean equipped) { }
    public record ItemList(List<Item> items) { }
    public record Inventory(List<OwnedItem> items) { }
    public record Equipment(List<OwnedItem> equipment) { }
    public record Purchase(String purchaseId, long itemId, int quantity, long unitPrice,
                           long totalPrice, long balanceAfter, long userItemId) { }
    /** itemId는 행동 로그용이다. 외형 동기화는 userId만 사용한다. */
    public record EquipmentChanged(long userId, Long itemId) {
        public EquipmentChanged(long userId) { this(userId, null); }
    }
}

