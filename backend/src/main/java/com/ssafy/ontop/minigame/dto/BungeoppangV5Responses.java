package com.ssafy.ontop.minigame.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** Wire DTOs for the Bungeoppang v5 rules contract. Slot, tray and stats keep the v4 wire shape. */
public final class BungeoppangV5Responses {
    private BungeoppangV5Responses() {
    }

    @Schema(name = "BungeoppangV5Rules")
    public record Rules(int slots, int durationMs, int countdownMs, int sideMs, int rushSideMs,
            int rushFromMs, int heatMin, int heatMax, int heatListLength, int trayCapacity,
            int maxOrderItems, int specialOrderChancePercent, int specialBonusPercent,
            BungeoppangV4Responses.FillingCounts firstOrder, int okFrom, int goldenFrom, int goldenTo,
            int burntFrom, int okPoint, int goldenPoint, int pointsPerCoin, int dailyCoinCap, int minGapMs,
            int sameSlotGapMs, int maxLogEntries, String heatAssignment, int maxActiveOrders) {
    }

    /** An issued customer order. A replacement becomes active only after its approved action prefix. */
    @Schema(name = "BungeoppangV5Order")
    public record Order(String orderId, int customerSlot, int availableAfterSeq,
            BungeoppangV4Responses.FillingCounts items) {
    }

    @Schema(name = "BungeoppangV5Checkpoint")
    public record Checkpoint(long revision, int throughSeq, String prefixHash, int heatCursor,
            Integer lastAt, List<BungeoppangV4Responses.Slot> slots,
            List<BungeoppangV4Responses.TrayBread> tray, BungeoppangV4Responses.Stats stats,
            List<Order> activeOrders) {
    }

    /** Timing keeps the v4 field names; only the play length differs. */
    @Schema(name = "BungeoppangV5StartResponse")
    public record StartResponse(String minigameSessionId, String minigameType, String status,
            String phase, String rulesVersion, String configVersion, Instant issuedAt, Instant startedAt,
            BungeoppangV4Responses.Timing timing, Rules rules, List<Integer> heats, boolean isFirstGame,
            Checkpoint checkpoint) {
    }

    /**
     * One approved delivery. {@code replacementOrder} is the order issued into the freed customer slot and is
     * always the same order that appears in {@code checkpoint.activeOrders}. A replayed response is the first
     * snapshot; the current state is read with GET.
     */
    @Schema(name = "BungeoppangV5DeliveryResponse")
    public record DeliveryResponse(String minigameSessionId, String deliveryKey, String orderId,
            boolean accepted, Instant acceptedAt, int throughSeq, String prefixHash,
            List<Long> consumedBreadIds, long scoreDelta, long bonusDelta, Order replacementOrder,
            Checkpoint checkpoint) {
    }

    @Schema(name = "BungeoppangV5SessionResponse")
    public record SessionResponse(String minigameSessionId, String rulesVersion, String configVersion,
            String status, String phase, Long score, long rewardAmount, Instant endedAt, String endReason,
            Instant serverNow, Instant startedAt, BungeoppangV4Responses.Timing timing, Checkpoint checkpoint,
            List<Object> acceptedLog, List<Order> issuedOrders, Object result, Object deliveryLookup,
            @JsonInclude(JsonInclude.Include.NON_NULL) Rules rules,
            @JsonInclude(JsonInclude.Include.NON_NULL) List<Integer> heats,
            @JsonInclude(JsonInclude.Include.NON_NULL) Instant issuedAt,
            @JsonInclude(JsonInclude.Include.NON_NULL) Boolean isFirstGame) {
    }
}
