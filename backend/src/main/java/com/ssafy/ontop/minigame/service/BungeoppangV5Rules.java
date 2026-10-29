package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Action;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Bread;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Filling;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Quality;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.SlotState;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Pure v5 replay engine. It performs no persistence, receipt, or wallet operation.
 * Heating starts at FILL, up to three customer orders are active at once, and burnt bread must be discarded.
 * Doneness, quality and scoring reuse the v4 functions with the v5 values.
 */
public final class BungeoppangV5Rules {
    /** A server-issued order. {@code availableAfterSeq} 0 is an opening order; s > 0 replaces DELIVER seq s. */
    public record Order(String orderId, int customerSlot, int availableAfterSeq, FillingCounts items) {
    }

    public record Result(long score, int made, int successfulMade, int golden, int failed, int wasted,
            int grillDiscarded, int trayDiscarded, int combo, int maxCombo, int served,
            int customersServed, int specialServed, long bonusScore, int heatCursor,
            List<SlotState> slots, List<Bread> tray, List<Order> activeOrders, Integer lastAt) {
    }

    private enum Phase { EMPTY, BATTER, FRONT, BACK }

    private static final class Slot {
        private Phase phase = Phase.EMPTY;
        private int since;
        private int heat = 100;
        private Filling filling;
        private int front;
        private Integer lastAt;
    }

    /** Replays an action prefix against the issued heat list and the full order issuance history. */
    public Result replay(List<Action> log, List<Integer> heats, List<Order> issued) {
        BungeoppangV4Responses.Rules rules = BungeoppangV5Spec.calculationRules();
        if (log == null || heats == null || issued == null) {
            throw invalid("BAD_ENTRY", -1);
        }
        if (log.size() > rules.maxLogEntries()) {
            throw invalid("LOG_TOO_LONG", -1);
        }
        validateHeats(heats, rules);
        validateIssued(issued, rules);

        Slot[] slots = new Slot[rules.slots()];
        Arrays.setAll(slots, ignored -> new Slot());
        List<Bread> tray = new ArrayList<>();
        List<Order> active = new ArrayList<>(issued.stream().filter(order -> order.availableAfterSeq() == 0).toList());
        int previous = -1;
        int heatCursor = 0;
        int made = 0;
        int successfulMade = 0;
        int golden = 0;
        int failed = 0;
        int grillDiscarded = 0;
        int trayDiscarded = 0;
        int combo = 0;
        int maxCombo = 0;
        int served = 0;
        int customersServed = 0;
        int specialServed = 0;
        long score = 0;
        long bonusScore = 0;

        for (int index = 0; index < log.size(); index++) {
            Action entry = log.get(index);
            validateCommon(entry, index, previous, rules);
            String action = entry.action();
            Order delivered = null;
            if ("DELIVER".equals(action)) {
                requireFields(entry, false, false, false, true, index);
                // Delivered and not-yet-activated orders are both outside the active set.
                Order order = null;
                for (Order candidate : active) {
                    if (candidate.orderId().equals(entry.orderId())) { order = candidate; break; }
                }
                if (order == null) { throw invalid("STALE_ORDER", index); }
                int[] needed = counts(order.items());
                int[] available = new int[4];
                tray.forEach(bread -> available[bread.filling().ordinal()]++);
                for (Filling filling : Filling.values()) {
                    if (available[filling.ordinal()] < needed[filling.ordinal()]) {
                        throw invalid("ORDER_NOT_READY", index);
                    }
                }
                // The tray is kept in take-out order, so each filling is consumed oldest first.
                List<Bread> remaining = new ArrayList<>(tray.size());
                long delta = 0;
                long bonus = 0;
                int count = 0;
                int special = 0;
                for (Bread bread : tray) {
                    int filling = bread.filling().ordinal();
                    if (needed[filling] == 0) {
                        remaining.add(bread);
                        continue;
                    }
                    needed[filling]--;
                    long extra = isSpecial(bread.filling())
                            ? Math.floorDiv(Math.multiplyExact((long) bread.points(),
                                    rules.specialBonusPercent()), 100)
                            : 0;
                    delta = Math.addExact(delta, Math.addExact(bread.points(), extra));
                    bonus = Math.addExact(bonus, extra);
                    count++;
                    if (isSpecial(bread.filling())) { special++; }
                }
                tray = remaining;
                score = Math.addExact(score, delta);
                bonusScore = Math.addExact(bonusScore, bonus);
                served += count;
                customersServed++;
                specialServed += special;
                active.remove(order);
                delivered = order;
            } else if ("TRAY_DISCARD".equals(action)) {
                requireFields(entry, false, false, true, false, index);
                int position = -1;
                for (int i = 0; i < tray.size(); i++) {
                    if (tray.get(i).breadId() == entry.breadId()) { position = i; break; }
                }
                if (position < 0) { throw invalid("ACTION_STATE_MISMATCH", index); }
                tray.remove(position);
                trayDiscarded++;
                combo = 0;
            } else {
                requireFields(entry, true, "FILL".equals(action), false, false, index);
                int slotIndex = entry.slot();
                if (slotIndex < 0 || slotIndex >= slots.length) { throw invalid("BAD_ENTRY", index); }
                Slot slot = slots[slotIndex];
                if (slot.lastAt != null && entry.t() - slot.lastAt < rules.sameSlotGapMs()) {
                    throw invalid("SAME_SLOT_TOO_FAST", index);
                }
                // The server never turns a TURN on burnt bread into a DISCARD; the client must send DISCARD.
                if (("FILL".equals(action) || "TURN".equals(action)) && burnt(slot, entry.t(), rules)) {
                    throw invalid("BURNT_BREAD", index);
                }
                switch (action) {
                    case "POUR" -> {
                        require(slot.phase == Phase.EMPTY, "ACTION_STATE_MISMATCH", index);
                        slot.phase = Phase.BATTER;
                        slot.lastAt = entry.t();
                    }
                    case "FILL" -> {
                        require(slot.phase == Phase.BATTER, "ACTION_STATE_MISMATCH", index);
                        if (heatCursor >= heats.size()) { throw invalid("TOO_MANY_FILLS", index); }
                        slot.phase = Phase.FRONT;
                        slot.since = entry.t();
                        slot.heat = heats.get(heatCursor++);
                        slot.filling = entry.filling();
                        slot.lastAt = entry.t();
                    }
                    case "DISCARD" -> {
                        require(slot.phase != Phase.EMPTY, "ACTION_STATE_MISMATCH", index);
                        if (burnt(slot, entry.t(), rules)) { failed++; }
                        reset(slot, entry.t());
                        grillDiscarded++;
                        combo = 0;
                    }
                    case "TURN" -> {
                        require(slot.phase == Phase.FRONT || slot.phase == Phase.BACK,
                                "ACTION_STATE_MISMATCH", index);
                        int cooked = BungeoppangV4Rules.doneness(slot.since, entry.t(), slot.heat, rules);
                        if (slot.phase == Phase.FRONT) {
                            slot.front = cooked;
                            slot.since = entry.t();
                            slot.phase = Phase.BACK;
                            slot.lastAt = entry.t();
                        } else {
                            int base = BungeoppangV4Rules.breadBase(slot.front, cooked, rules);
                            if (base > 0 && tray.size() >= rules.trayCapacity()) {
                                throw invalid("TRAY_FULL", index);
                            }
                            boolean perfect = BungeoppangV4Rules.quality(slot.front, rules) == Quality.PERFECT
                                    && BungeoppangV4Rules.quality(cooked, rules) == Quality.PERFECT;
                            if (perfect) {
                                combo++;
                                golden++;
                            } else if (base == 0) {
                                combo = 0;
                                failed++;
                            }
                            int points = BungeoppangV4Rules.comboPoints(base, combo);
                            long breadId = ++made;
                            if (base > 0) {
                                successfulMade++;
                                tray.add(new Bread(breadId, slot.filling, slot.front, cooked, points));
                            }
                            maxCombo = Math.max(maxCombo, combo);
                            reset(slot, entry.t());
                        }
                    }
                    default -> throw invalid("BAD_ENTRY", index);
                }
            }
            activate(issued, active, entry.seq(), delivered, index);
            previous = entry.t();
        }
        List<SlotState> slotStates = new ArrayList<>(slots.length);
        for (int i = 0; i < slots.length; i++) {
            Slot slot = slots[i];
            slotStates.add(new SlotState(i, slot.phase.name().toLowerCase(Locale.ROOT), slot.since,
                    slot.heat, slot.filling, slot.front, slot.lastAt));
        }
        return new Result(score, made, successfulMade, golden, failed,
                grillDiscarded + trayDiscarded, grillDiscarded, trayDiscarded, combo, maxCombo,
                served, customersServed, specialServed, bonusScore, heatCursor,
                Collections.unmodifiableList(slotStates),
                Collections.unmodifiableList(new ArrayList<>(tray)),
                List.copyOf(active),
                log.isEmpty() ? null : log.getLast().t());
    }

    /** Only the customer slot freed by an approved DELIVER is refilled, right after that action. */
    private static void activate(List<Order> issued, List<Order> active, int seq, Order delivered, int index) {
        List<Order> replacements = issued.stream().filter(order -> order.availableAfterSeq() == seq).toList();
        if (replacements.isEmpty()) {
            return;
        }
        Order replacement = replacements.getFirst();
        if (delivered == null || replacements.size() != 1
                || replacement.customerSlot() != delivered.customerSlot()
                || active.size() >= BungeoppangV5Spec.MAX_ACTIVE_ORDERS
                || active.stream().anyMatch(order -> order.customerSlot() == replacement.customerSlot())) {
            throw invalid("BAD_ORDER", index);
        }
        active.add(replacement);
    }

    private static void validateIssued(List<Order> issued, BungeoppangV4Responses.Rules rules) {
        Set<String> ids = new HashSet<>();
        Set<Integer> openingSlots = new HashSet<>();
        for (Order order : issued) {
            if (order == null || order.orderId() == null || !order.orderId().matches("[1-9][0-9]{0,18}")
                    || !ids.add(order.orderId()) || order.customerSlot() < 0
                    || order.customerSlot() >= BungeoppangV5Spec.MAX_ACTIVE_ORDERS
                    || order.availableAfterSeq() < 0 || order.availableAfterSeq() > rules.maxLogEntries()
                    || !validItems(order.items(), rules)) {
                throw invalid("BAD_ORDER", -1);
            }
            if (order.availableAfterSeq() == 0 && !openingSlots.add(order.customerSlot())) {
                throw invalid("BAD_ORDER", -1);
            }
        }
        if (openingSlots.isEmpty()) {
            throw invalid("BAD_ORDER", -1);
        }
    }

    private static boolean validItems(FillingCounts items, BungeoppangV4Responses.Rules rules) {
        if (items == null || items.bean() < 0 || items.custard() < 0 || items.pizza() < 0
                || items.chocolate() < 0) {
            return false;
        }
        long total = (long) items.bean() + items.custard() + items.pizza() + items.chocolate();
        return total >= 1 && total <= rules.maxOrderItems();
    }

    /** Batter is not heated, so only a filled side can burn. */
    private static boolean burnt(Slot slot, int at, BungeoppangV4Responses.Rules rules) {
        return (slot.phase == Phase.FRONT || slot.phase == Phase.BACK)
                && (slot.front >= rules.burntFrom()
                        || BungeoppangV4Rules.doneness(slot.since, at, slot.heat, rules) >= rules.burntFrom());
    }

    private static void validateHeats(List<Integer> heats, BungeoppangV4Responses.Rules rules) {
        if (heats.isEmpty() || heats.size() > rules.heatListLength() || heats.stream().anyMatch(value -> value == null
                || value < rules.heatMin() || value > rules.heatMax())) {
            throw invalid("BAD_HEAT_SOURCE", -1);
        }
    }

    private static void validateCommon(Action entry, int index, int previous, BungeoppangV4Responses.Rules rules) {
        if (entry == null || entry.seq() != index + 1 || entry.action() == null
                || entry.t() < 0 || entry.t() >= rules.durationMs()) {
            throw invalid("BAD_ENTRY", index);
        }
        if (previous >= 0 && entry.t() < previous) { throw invalid("TIME_REVERSED", index); }
        if (previous >= 0 && entry.t() - previous < rules.minGapMs()) {
            throw invalid("TOO_FAST", index);
        }
    }

    private static void requireFields(Action entry, boolean slot, boolean filling, boolean bread,
            boolean delivery, int index) {
        boolean valid = (slot == (entry.slot() != null)) && (filling == (entry.filling() != null))
                && (bread == (entry.breadId() != null))
                && (delivery == (entry.orderId() != null && entry.deliveryKey() != null));
        if (!delivery && (entry.orderId() != null || entry.deliveryKey() != null)) { valid = false; }
        if (bread && entry.breadId() != null && entry.breadId() <= 0) { valid = false; }
        if (delivery && (entry.deliveryKey() == null || entry.deliveryKey().isBlank()
                || !entry.deliveryKey().matches("[A-Za-z0-9_-]{1,64}"))) { valid = false; }
        if (!valid) { throw invalid("BAD_ENTRY", index); }
    }

    private static void require(boolean condition, String detail, int index) {
        if (!condition) { throw invalid(detail, index); }
    }

    private static void reset(Slot slot, int at) {
        slot.phase = Phase.EMPTY;
        slot.since = 0;
        slot.heat = 100;
        slot.filling = null;
        slot.front = 0;
        slot.lastAt = at;
    }

    private static int[] counts(FillingCounts items) {
        return new int[]{items.bean(), items.custard(), items.pizza(), items.chocolate()};
    }

    private static boolean isSpecial(Filling filling) {
        return filling == Filling.PIZZA || filling == Filling.CHOCOLATE;
    }

    private static MinigameException invalid(String detail, int index) {
        return new MinigameException(422, "LOG_INVALID", "입력 기록을 확인할 수 없습니다.", detail, index);
    }
}
