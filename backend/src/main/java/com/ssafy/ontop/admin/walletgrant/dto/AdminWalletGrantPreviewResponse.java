package com.ssafy.ontop.admin.walletgrant.dto;

public record AdminWalletGrantPreviewResponse(long amountPerMember, String reason,
        long recipientCount, long missingWalletCount, long totalAmount, boolean executable) {
}
