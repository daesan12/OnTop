package com.ssafy.ontop.shop.dto;

public record OwnedItemResponse(long userItemId, ItemResponse item, int quantity, boolean equipped) { }
