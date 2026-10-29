package com.ssafy.ontop.minigame.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire DTOs for the v4 final verification and immutable settlement result. */
public final class BungeoppangV4CompleteDtos {
    private BungeoppangV4CompleteDtos() {
    }

    @Schema(name = "BungeoppangV4CompleteRequest")
    public record Request(String rulesVersion, int throughSeq, String prefixHash,
            List<BungeoppangV4DeliveryDtos.Action> log, List<String> seenTips, Long clientScore) {
    }

    @Schema(name = "BungeoppangV4CompleteResponse",
            description = "v4와 v5 완료가 함께 쓰는 정산 응답입니다. rulesVersion이 v4 또는 v5입니다.")
    public record Response(String minigameSessionId, String status, String rulesVersion, String configVersion,
            int verifiedCompletedCount, long rewardAmount, long score, int made, int golden, int failed,
            int wasted, int maxCombo, long coinsCalculated, long coinsGranted, long todayEarned,
            int dailyCap, boolean capReached, int successfulMade, int served, int customersServed,
            int specialServed, long bonusScore, int grillDiscarded, int trayDiscarded,
            int undeliveredCount, int unfinishedGrillCount, LocalDate rewardDate, Instant settledAt,
            int finalThroughSeq, String finalPrefixHash) {
    }
}
