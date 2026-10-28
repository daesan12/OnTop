package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
import java.util.ArrayList;
import java.util.List;

/** Immutable v5 configuration. Changing a value requires a new config version; v4 stays untouched. */
public final class BungeoppangV5Spec {
    public static final String RULES_VERSION = "v5";
    public static final String CONFIG_VERSION = "v5-20261027.1";
    public static final String HEAT_ASSIGNMENT = "FILL";
    public static final int DURATION_MS = 180_000;
    public static final int MAX_ACTIVE_ORDERS = 3;

    private static final BungeoppangV4Responses.FillingCounts FIRST_ORDER =
            new BungeoppangV4Responses.FillingCounts(2, 0, 0, 0);
    private static final BungeoppangV5Responses.Rules RULES = new BungeoppangV5Responses.Rules(
            6, DURATION_MS, 3_500, 8_000, 6_000, 150_000, 85, 115, 2_048,
            10, 4, 20, 50, FIRST_ORDER, 50, 70, 90, 100, 2, 5, 15, 100,
            50, 300, 3_600, HEAT_ASSIGNMENT, MAX_ACTIVE_ORDERS);
    /** The same values in the v4 shape, so the shared v4 doneness and scoring functions apply unchanged. */
    private static final BungeoppangV4Responses.Rules CALCULATION_RULES = new BungeoppangV4Responses.Rules(
            RULES.slots(), RULES.durationMs(), RULES.countdownMs(), RULES.sideMs(), RULES.rushSideMs(),
            RULES.rushFromMs(), RULES.heatMin(), RULES.heatMax(), RULES.heatListLength(), RULES.trayCapacity(),
            RULES.maxOrderItems(), RULES.specialOrderChancePercent(), RULES.specialBonusPercent(),
            RULES.firstOrder(), RULES.okFrom(), RULES.goldenFrom(), RULES.goldenTo(), RULES.burntFrom(),
            RULES.okPoint(), RULES.goldenPoint(), RULES.pointsPerCoin(), RULES.dailyCoinCap(), RULES.minGapMs(),
            RULES.sameSlotGapMs(), RULES.maxLogEntries());

    private BungeoppangV5Spec() {
    }

    public static BungeoppangV5Responses.Rules rules() {
        return RULES;
    }

    static BungeoppangV4Responses.Rules calculationRules() {
        return CALCULATION_RULES;
    }

    public static String initialPrefixHash(long sessionId) {
        return BungeoppangV5DeliveryContract.prefixHash(sessionId, CONFIG_VERSION, List.of());
    }

    public static BungeoppangV5Responses.Order order(BungeoppangV5Rules.Order order) {
        BungeoppangV4Rules.FillingCounts items = order.items();
        return new BungeoppangV5Responses.Order(order.orderId(), order.customerSlot(), order.availableAfterSeq(),
                new BungeoppangV4Responses.FillingCounts(items.bean(), items.custard(), items.pizza(),
                        items.chocolate()));
    }

    /** Batter and empty slots keep the v4 placeholders since=0 and heat=100; they carry no heating. */
    public static BungeoppangV5Responses.Checkpoint checkpoint(long revision, int throughSeq, String prefixHash,
            BungeoppangV5Rules.Result result) {
        var slots = new ArrayList<BungeoppangV4Responses.Slot>(result.slots().size());
        for (BungeoppangV4Rules.SlotState slot : result.slots()) {
            slots.add(new BungeoppangV4Responses.Slot(slot.slot(), slot.phase(), slot.since(), slot.heat(),
                    slot.filling() == null ? null : slot.filling().wireName(), slot.front(), slot.lastAt()));
        }
        var tray = result.tray().stream()
                .map(bread -> new BungeoppangV4Responses.TrayBread(bread.breadId(), bread.filling().wireName(),
                        bread.front(), bread.back(), bread.points()))
                .toList();
        var stats = new BungeoppangV4Responses.Stats(result.score(), result.made(), result.successfulMade(),
                result.golden(), result.failed(), result.wasted(), result.grillDiscarded(), result.trayDiscarded(),
                result.combo(), result.maxCombo(), result.served(), result.customersServed(),
                result.specialServed(), result.bonusScore());
        return new BungeoppangV5Responses.Checkpoint(revision, throughSeq, prefixHash, result.heatCursor(),
                result.lastAt(), List.copyOf(slots), tray, stats,
                result.activeOrders().stream().map(BungeoppangV5Spec::order).toList());
    }
}
