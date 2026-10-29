package com.ssafy.ontop.shop.dto;

public record PurchaseResponse(String purchaseId, long itemId, int quantity, long unitPrice,
        long totalPrice, long balanceAfter, long userItemId) { }
