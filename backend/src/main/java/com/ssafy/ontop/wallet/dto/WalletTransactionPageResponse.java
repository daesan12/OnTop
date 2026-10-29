package com.ssafy.ontop.wallet.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(requiredProperties = {"transactions", "nextCursor", "hasNext"})
public record WalletTransactionPageResponse(
        @Schema(description = "거래 ID 내림차순. 내역이 없으면 빈 배열") List<WalletTransactionResponse> transactions,
        @Schema(description = "다음 요청의 cursor. 다음 페이지가 없으면 null", nullable = true) Long nextCursor,
        @Schema(description = "다음 페이지 존재 여부") boolean hasNext) {

    public WalletTransactionPageResponse {
        transactions = List.copyOf(transactions);
    }
}
