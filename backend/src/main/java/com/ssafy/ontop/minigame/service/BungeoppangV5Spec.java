package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Immutable v5 configuration. Changing a value requires a new config version; v4 stays untouched. */
public final class BungeoppangV5Spec {
    public static final String RULES_VERSION = "v5";
    /** New rounds: 120 seconds, rush from 90 seconds. */
    public static final String CONFIG_VERSION = "v5-20261101.1";
    /**
     * Rounds issued before 2026-10-29: 180 seconds, rush from 150 seconds. Such a round keeps this snapshot in
     * its stored config, which stays authoritative; this copy only names it for regression checks.
     */
    public static final String LEGACY_CONFIG_VERSION = "v5-20261027.1";
    public static final String HEAT_ASSIGNMENT = "FILL";
    public static final int START_BUFFER_MS = 1_000;
    public static final int COUNTDOWN_MS = 3_500;
    public static final int DURATION_MS = 120_000;
    public static final int RUSH_FROM_MS = 90_000;
    public static final int SUBMISSION_GRACE_MS = 15_000;
    public static final int PROCESSING_DRAIN_MS = 10_000;
    public static final int MAX_ACTIVE_ORDERS = 3;

    private static final BungeoppangV4Responses.FillingCounts FIRST_ORDER =
            new BungeoppangV4Responses.FillingCounts(2, 0, 0, 0);
    private static final BungeoppangV5Responses.Rules RULES = rules(DURATION_MS, RUSH_FROM_MS);
    private static final BungeoppangV5Responses.Rules LEGACY_RULES = rules(180_000, 150_000);

    private BungeoppangV5Spec() {
    }

    /** Rules for a newly issued round. An existing round always uses the snapshot stored with it. */
    public static BungeoppangV5Responses.Rules rules() {
        return RULES;
    }

    /** The snapshot stored with {@link #LEGACY_CONFIG_VERSION} rounds; never issued again. */
    public static BungeoppangV5Responses.Rules legacyRules() {
        return LEGACY_RULES;
    }

    /** Only the play length and rush start differ between config versions. */
    private static BungeoppangV5Responses.Rules rules(int durationMs, int rushFromMs) {
        return new BungeoppangV5Responses.Rules(
                6, durationMs, COUNTDOWN_MS, 8_000, 6_000, rushFromMs, 85, 115, 2_048,
                10, 4, 20, 50, FIRST_ORDER, 50, 70, 90, 100, 2, 5, 15, MinigameRewardBudget.DAILY_CAP,
                50, 300, 3_600, HEAT_ASSIGNMENT, MAX_ACTIVE_ORDERS, durationMs == DURATION_MS ? 5 : 0);
    }

    /**
     * The given v5 rules in the v4 shape, so the shared v4 doneness and scoring functions apply unchanged.
     * Replay, delivery and settlement pass the round's stored snapshot here, never the current constants.
     */
    public static BungeoppangV4Responses.Rules calculationRules(BungeoppangV5Responses.Rules rules) {
        return new BungeoppangV4Responses.Rules(
                rules.slots(), rules.durationMs(), rules.countdownMs(), rules.sideMs(), rules.rushSideMs(),
                rules.rushFromMs(), rules.heatMin(), rules.heatMax(), rules.heatListLength(), rules.trayCapacity(),
                rules.maxOrderItems(), rules.specialOrderChancePercent(), rules.specialBonusPercent(),
                rules.firstOrder(), rules.okFrom(), rules.goldenFrom(), rules.goldenTo(), rules.burntFrom(),
                rules.okPoint(), rules.goldenPoint(), rules.pointsPerCoin(), rules.dailyCoinCap(), rules.minGapMs(),
                rules.sameSlotGapMs(), rules.maxLogEntries());
    }

    /** Same phase boundaries as v4 with a 120 second play window; the countdown is not part of it. */
    public static BungeoppangV4Responses.Timing timing(Instant issuedAt) {
        Instant countdown = issuedAt.plusMillis(START_BUFFER_MS);
        Instant play = countdown.plusMillis(COUNTDOWN_MS);
        Instant end = play.plusMillis(DURATION_MS);
        Instant deadline = end.plusMillis(SUBMISSION_GRACE_MS);
        return new BungeoppangV4Responses.Timing(countdown, play, end, deadline,
                deadline.plusMillis(PROCESSING_DRAIN_MS));
    }

    /** The hash seed carries the round's stored config version. */
    public static String initialPrefixHash(long sessionId, String configVersion) {
        return BungeoppangV5DeliveryContract.prefixHash(sessionId, configVersion, List.of());
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
                result.activeOrders().stream().map(BungeoppangV5Spec::order).toList(), result.complainedOrderIds());
    }
}
