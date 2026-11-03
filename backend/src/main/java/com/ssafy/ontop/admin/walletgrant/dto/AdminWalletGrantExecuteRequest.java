package com.ssafy.ontop.admin.walletgrant.dto;

import java.util.UUID;

public record AdminWalletGrantExecuteRequest(UUID requestId, long amountPerMember,
        String reason, long expectedRecipientCount) {
}
