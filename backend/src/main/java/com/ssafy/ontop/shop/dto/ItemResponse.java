package com.ssafy.ontop.shop.dto;

import com.ssafy.ontop.item.domain.EquipSlot;
import com.ssafy.ontop.item.domain.ItemType;

public record ItemResponse(long itemId, String itemCode, String name, ItemType itemType,
        EquipSlot equipSlot, long price, String imageKey) { }
