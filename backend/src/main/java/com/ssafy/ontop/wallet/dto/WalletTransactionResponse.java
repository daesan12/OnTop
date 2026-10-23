package com.ssafy.ontop.wallet.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

@Schema(requiredProperties = {"transactionId", "transactionType", "balanceDelta", "reservedDelta",
        "itemId", "gameSessionId", "minigameSessionId", "createdAt"})
public record WalletTransactionResponse(
        @Schema(description = "거래 ID", example = "1") long transactionId,
        @Schema(description = "원장에 기록된 거래 유형", example = "SIGNUP_BONUS") String transactionType,
        @Schema(description = "전체 잔액 증감", example = "100") long balanceDelta,
        @Schema(description = "예약 잔액 증감", example = "0") long reservedDelta,
        @Schema(description = "관련 상품 ID. 없으면 null", nullable = true) Long itemId,
        @Schema(description = "관련 게임 세션 ID. 없으면 null", nullable = true) Long gameSessionId,
        @Schema(description = "관련 미니게임 세션 ID. 없으면 null", nullable = true) Long minigameSessionId,
        @Schema(description = "원장 기록 시각 (UTC)", example = "2026-10-23T10:00:00Z") Instant createdAt) {
}
