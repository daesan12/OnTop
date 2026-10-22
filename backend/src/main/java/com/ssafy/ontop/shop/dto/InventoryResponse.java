package com.ssafy.ontop.shop.dto;

import java.util.List;

public record InventoryResponse(List<OwnedItemResponse> items) { }
