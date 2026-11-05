package com.ssafy.ontop.admin.walletgrant.dto;

import java.time.Instant;
import java.util.UUID;

public record AdminWalletGrantExecuteResponse(long batchId, UUID requestId, long amountPerMember,
        String reason, long recipientCount, long totalAmount, Instant executedAt) {
}
