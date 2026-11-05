package com.ssafy.ontop.shop.dto;

import com.ssafy.ontop.item.domain.EquipSlot;
import com.ssafy.ontop.item.domain.ItemType;

/** setCode는 세트 의상 묶음이다. null이면 부위별로 따로 입는 의상이다. */
public record ItemResponse(long itemId, String itemCode, String name, ItemType itemType,
        EquipSlot equipSlot, long price, String imageKey, String setCode) {

    public ItemResponse(long itemId, String itemCode, String name, ItemType itemType,
            EquipSlot equipSlot, long price, String imageKey) {
        this(itemId, itemCode, name, itemType, equipSlot, price, imageKey, null);
    }
}
