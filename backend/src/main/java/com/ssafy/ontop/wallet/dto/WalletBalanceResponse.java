package com.ssafy.ontop.wallet.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"balance", "reservedBalance", "availableBalance"})
public record WalletBalanceResponse(
        @Schema(description = "전체 보유 코인. 예약 잔액을 포함합니다.", example = "100", minimum = "0") long balance,
        @Schema(description = "전체 잔액 중 예약된 코인", example = "0", minimum = "0") long reservedBalance,
        @Schema(description = "사용 가능 코인: balance - reservedBalance", example = "100", minimum = "0")
        long availableBalance) {
}
