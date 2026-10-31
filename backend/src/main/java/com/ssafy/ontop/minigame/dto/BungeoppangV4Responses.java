package com.ssafy.ontop.minigame.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** Wire DTOs for the explicitly selected Bungeoppang v4 session contract. */
public final class BungeoppangV4Responses {
    private BungeoppangV4Responses() {
    }

    @Schema(name = "BungeoppangV4FillingCounts")
    public record FillingCounts(int bean, int custard, int pizza, int chocolate) {
    }

    @Schema(name = "BungeoppangV4Order")
    public record Order(String orderId, int orderIndex, FillingCounts items) {
    }

    @Schema(name = "BungeoppangV4Timing")
    public record Timing(Instant countdownStartsAt, Instant playStartsAt, Instant playEndsAt,
            Instant submitDeadline, Instant expiresAt, boolean paused, long pauseRevision) {
        public Timing(Instant countdownStartsAt, Instant playStartsAt, Instant playEndsAt,
                Instant submitDeadline, Instant expiresAt) {
            this(countdownStartsAt, playStartsAt, playEndsAt, submitDeadline, expiresAt, false, 0);
        }
    }

    @Schema(name = "BungeoppangV4Rules")
    public record Rules(int slots, int durationMs, int countdownMs, int sideMs, int rushSideMs,
            int rushFromMs, int heatMin, int heatMax, int heatListLength, int trayCapacity,
            int maxOrderItems, int specialOrderChancePercent, int specialBonusPercent,
            FillingCounts firstOrder, int okFrom, int goldenFrom, int goldenTo, int burntFrom,
            int okPoint, int goldenPoint, int pointsPerCoin, int dailyCoinCap, int minGapMs,
            int sameSlotGapMs, int maxLogEntries) {
    }

    @Schema(name = "BungeoppangV4CheckpointSlot")
    public record Slot(int slot, String phase, int since, int heat, String filling, int front,
            Integer lastAt) {
    }

    @Schema(name = "BungeoppangV4CheckpointStats")
    public record Stats(long score, int made, int successfulMade, int golden, int failed, int wasted,
            int grillDiscarded, int trayDiscarded, int combo, int maxCombo, int served,
            int customersServed, int specialServed, long bonusScore) {
    }

    @Schema(name = "BungeoppangV4CheckpointBread")
    public record TrayBread(long breadId, String filling, int front, int back, int points) {
    }

    @Schema(name = "BungeoppangV4Checkpoint")
    public record Checkpoint(long revision, int throughSeq, String prefixHash, int heatCursor,
            Integer lastAt, List<Slot> slots, List<TrayBread> tray, Stats stats, Order currentOrder) {
    }

    @Schema(name = "BungeoppangV4StartResponse")
    public record StartResponse(String minigameSessionId, String minigameType, String status,
            String phase, String rulesVersion, String configVersion, Instant issuedAt, Instant startedAt,
            Timing timing, Rules rules, List<Integer> heats, boolean isFirstGame, Checkpoint checkpoint) {
    }

    @Schema(name = "BungeoppangV4LobbyResponse")
    public record LobbyResponse(String rulesVersion, Instant serverNow, long todayEarned, int dailyCap,
            boolean isFirstGame, List<String> seenTips, String activeSessionId,
            List<String> supportedRulesVersions) {
    }

    @Schema(name = "BungeoppangV4SessionResponse")
    public record SessionResponse(String minigameSessionId, String rulesVersion, String configVersion,
            String status, String phase, Long score, long rewardAmount, Instant endedAt, String endReason,
            Instant serverNow, Instant startedAt, Timing timing, Checkpoint checkpoint,
            List<Object> acceptedLog, List<Order> issuedOrders, Object result, Object deliveryLookup,
            @JsonInclude(JsonInclude.Include.NON_NULL) Rules rules,
            @JsonInclude(JsonInclude.Include.NON_NULL) List<Integer> heats,
            @JsonInclude(JsonInclude.Include.NON_NULL) Instant issuedAt,
            @JsonInclude(JsonInclude.Include.NON_NULL) Boolean isFirstGame) {
    }
}
