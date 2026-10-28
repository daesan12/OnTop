package com.ssafy.ontop.minigame.dto;

import io.swagger.v3.oas.annotations.media.Schema;
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
}
