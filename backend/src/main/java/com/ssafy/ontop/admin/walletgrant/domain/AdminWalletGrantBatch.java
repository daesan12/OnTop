package com.ssafy.ontop.admin.walletgrant.domain;

import java.time.Instant;
import java.util.UUID;

public record AdminWalletGrantBatch(long id, UUID requestId, long administratorUserId,
        long amountPerMember, String reason, long recipientCount, long totalAmount, Instant executedAt) {
}
