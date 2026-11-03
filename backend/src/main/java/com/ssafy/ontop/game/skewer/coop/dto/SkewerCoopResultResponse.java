package com.ssafy.ontop.game.skewer.coop.dto;

import java.time.Instant;
import java.time.LocalDate;

/** 상대방의 지갑·지급액을 포함하지 않는 개인 정산 영수증. */
public record SkewerCoopResultResponse(String gameId, String status, int teamScore, int served, String endReason,
        String rankingStatus, String rankingReason, int coinsCalculated, Integer coinsGranted, Long todayEarned,
        int dailyCap, Long remainingToday, Long balance, LocalDate rewardDate, Instant settledAt) {
}
