package com.ssafy.ontop.minigame.service;

import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.random.RandomGenerator;

/** Pure v4 replay engine. It performs no persistence, receipt, or wallet operation. */
public final class BungeoppangV4Rules {
    public enum Filling {
        BEAN, CUSTARD, PIZZA, CHOCOLATE;

        public String wireName() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    public enum Quality { RAW, GOOD, PERFECT, BURNT }

    public record FillingCounts(int bean, int custard, int pizza, int chocolate) {
        int count(Filling filling) {
            return switch (filling) {
                case BEAN -> bean;
                case CUSTARD -> custard;
                case PIZZA -> pizza;
                case CHOCOLATE -> chocolate;
            };
        }

        int total() {
            return Math.addExact(Math.addExact(bean, custard), Math.addExact(pizza, chocolate));
        }
    }

    public record Order(String orderId, int orderIndex, FillingCounts items) {
    }

    public record Action(int seq, String action, int t, Integer slot, Filling filling,
            Long breadId, String orderId, String deliveryKey) {
        public static Action pour(int seq, int t, int slot) {
            return new Action(seq, "POUR", t, slot, null, null, null, null);
        }

        public static Action fill(int seq, int t, int slot, Filling filling) {
            return new Action(seq, "FILL", t, slot, filling, null, null, null);
        }

        public static Action turn(int seq, int t, int slot) {
            return new Action(seq, "TURN", t, slot, null, null, null, null);
        }

        public static Action discard(int seq, int t, int slot) {
            return new Action(seq, "DISCARD", t, slot, null, null, null, null);
        }

        public static Action trayDiscard(int seq, int t, long breadId) {
            return new Action(seq, "TRAY_DISCARD", t, null, null, breadId, null, null);
        }

        public static Action deliver(int seq, int t, String orderId, String deliveryKey) {
            return new Action(seq, "DELIVER", t, null, null, null, orderId, deliveryKey);
        }
    }

    public record Bread(long breadId, Filling filling, int front, int back, int points) {
    }

    public record SlotState(int slot, String phase, int since, int heat, Filling filling,
            int front, Integer lastAt) {
    }

    public record Result(long score, int made, int successfulMade, int golden, int failed, int wasted,
            int grillDiscarded, int trayDiscarded, int combo, int maxCombo, int served,
            int customersServed, int specialServed, long bonusScore, int heatCursor,
            List<SlotState> slots, List<Bread> tray, Order currentOrder, Integer lastAt) {
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

    public Result replay(List<Action> log, List<Integer> heats, List<Order> orders) {
        return replay(log, heats, orders, BungeoppangV4Spec.rules());
    }

    public Result replay(List<Action> log, List<Integer> heats, List<Order> orders,
            BungeoppangV4Responses.Rules rules) {
        requireRules(rules);
        if (log == null || heats == null || orders == null || orders.isEmpty()) {
            throw invalid("BAD_ENTRY", -1);
        }
        if (log.size() > rules.maxLogEntries()) {
            throw invalid("LOG_TOO_LONG", -1);
        }
        validateHeats(heats, rules);
        for (int i = 0; i < orders.size(); i++) {
            validateOrder(orders.get(i), i, rules);
        }

        Slot[] slots = new Slot[rules.slots()];
        Arrays.setAll(slots, ignored -> new Slot());
        List<Bread> tray = new ArrayList<>();
        int previous = -1;
        int heatCursor = 0;
        int orderCursor = 0;
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
            if ("DELIVER".equals(action)) {
                requireFields(entry, false, false, false, true, index);
                if (orderCursor >= orders.size() || !orders.get(orderCursor).orderId().equals(entry.orderId())) {
                    throw invalid("STALE_ORDER", index);
                }
                Order order = orders.get(orderCursor);
                int[] needed = counts(order.items());
                int[] available = new int[4];
                tray.forEach(bread -> available[bread.filling().ordinal()]++);
                for (Filling filling : Filling.values()) {
                    if (available[filling.ordinal()] < needed[filling.ordinal()]) {
                        throw invalid("ORDER_NOT_READY", index);
                    }
                }
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
                orderCursor++;
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
                        reset(slot, entry.t());
                        grillDiscarded++;
                        combo = 0;
                    }
                    case "TURN" -> {
                        require(slot.phase == Phase.FRONT || slot.phase == Phase.BACK,
                                "ACTION_STATE_MISMATCH", index);
                        int cooked = doneness(slot.since, entry.t(), slot.heat, rules);
                        if (slot.phase == Phase.FRONT) {
                            slot.front = cooked;
                            slot.since = entry.t();
                            slot.phase = Phase.BACK;
                            slot.lastAt = entry.t();
                        } else {
                            int base = breadBase(slot.front, cooked, rules);
                            if (base > 0 && tray.size() >= rules.trayCapacity()) {
                                throw invalid("TRAY_FULL", index);
                            }
                            boolean perfect = quality(slot.front, rules) == Quality.PERFECT
                                    && quality(cooked, rules) == Quality.PERFECT;
                            if (perfect) {
                                combo++;
                                golden++;
                            } else if (base == 0) {
                                combo = 0;
                                failed++;
                            }
                            int points = comboPoints(base, combo);
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
            previous = entry.t();
        }
        Order current = orderCursor < orders.size() ? orders.get(orderCursor) : null;
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
                Collections.unmodifiableList(new ArrayList<>(tray)), current,
                log.isEmpty() ? null : log.getLast().t());
    }

    public Order nextOrder(int orderIndex, RandomGenerator random) {
        return nextOrder(orderIndex, random, BungeoppangV4Spec.rules());
    }

    public Order nextOrder(int orderIndex, RandomGenerator random, BungeoppangV4Responses.Rules rules) {
        requireRules(rules);
        if (orderIndex < 0 || random == null) { throw new IllegalArgumentException("주문 생성 입력 오류"); }
        if (orderIndex == 0) {
            BungeoppangV4Responses.FillingCounts first = rules.firstOrder();
            if (first == null) { throw new IllegalArgumentException("첫 주문 설정이 필요합니다."); }
            return new Order("1", 0, new FillingCounts(
                    first.bean(), first.custard(), first.pizza(), first.chocolate()));
        }
        int[] values = new int[4];
        boolean special = random.nextInt(100) < rules.specialOrderChancePercent();
        int total = 1 + random.nextInt(rules.maxOrderItems());
        int already = 0;
        if (special) {
            values[2 + random.nextInt(2)]++;
            already = 1;
        }
        for (int i = already; i < total; i++) {
            values[random.nextInt(special ? 4 : 2)]++;
        }
        return new Order(Integer.toString(orderIndex + 1), orderIndex,
                new FillingCounts(values[0], values[1], values[2], values[3]));
    }

    public void validateOrder(Order order, int expectedIndex) {
        validateOrder(order, expectedIndex, BungeoppangV4Spec.rules());
    }

    public void validateOrder(Order order, int expectedIndex, BungeoppangV4Responses.Rules rules) {
        requireRules(rules);
        if (order == null || order.items() == null || order.orderIndex() != expectedIndex
                || !Integer.toString(expectedIndex + 1).equals(order.orderId())) {
            throw invalid("BAD_ORDER", -1);
        }
        FillingCounts items = order.items();
        int total;
        try { total = items.total(); }
        catch (ArithmeticException exception) { throw invalid("BAD_ORDER", -1); }
        if (items.bean() < 0 || items.custard() < 0 || items.pizza() < 0 || items.chocolate() < 0
                || total < 1 || total > rules.maxOrderItems()) {
            throw invalid("BAD_ORDER", -1);
        }
    }

    public static int doneness(int since, int at, int heat) {
        return doneness(since, at, heat, BungeoppangV4Spec.rules());
    }

    public static int doneness(int since, int at, int heat, BungeoppangV4Responses.Rules rules) {
        requireRules(rules);
        if (since < 0 || at < since || at >= rules.durationMs()
                || heat < rules.heatMin() || heat > rules.heatMax()) {
            throw new IllegalArgumentException("익힘 계산 입력 오류");
        }
        long split = Math.min(Math.max((long) rules.rushFromMs(), since), at);
        long normal = split - since;
        long rush = at - split;
        long numerator = Math.addExact(Math.multiplyExact(normal, 100L * rules.rushSideMs()),
                Math.multiplyExact(rush, 100L * rules.sideMs()));
        numerator = Math.multiplyExact(numerator, heat);
        long denominator = (long) rules.sideMs() * rules.rushSideMs() * 100;
        return Math.toIntExact(Math.floorDiv(numerator, denominator));
    }

    public static Quality quality(int cooked) {
        return quality(cooked, BungeoppangV4Spec.rules());
    }

    public static Quality quality(int cooked, BungeoppangV4Responses.Rules rules) {
        requireRules(rules);
        if (cooked < rules.okFrom()) { return Quality.RAW; }
        if (cooked <= rules.goldenTo() && cooked >= rules.goldenFrom()) { return Quality.PERFECT; }
        if (cooked < rules.burntFrom()) { return Quality.GOOD; }
        return Quality.BURNT;
    }

    public static int breadBase(int front, int back) {
        return breadBase(front, back, BungeoppangV4Spec.rules());
    }

    public static int breadBase(int front, int back, BungeoppangV4Responses.Rules rules) {
        requireRules(rules);
        Quality first = quality(front, rules);
        Quality second = quality(back, rules);
        if (first == Quality.RAW || first == Quality.BURNT || second == Quality.RAW
                || second == Quality.BURNT) {
            return 0;
        }
        return sidePoints(first, rules) + sidePoints(second, rules);
    }

    public static int comboPoints(int base, int combo) {
        return Math.floorDiv(Math.multiplyExact(base, combo >= 6 ? 15 : combo >= 3 ? 12 : 10), 10);
    }

    private static int sidePoints(Quality quality, BungeoppangV4Responses.Rules rules) {
        return quality == Quality.PERFECT ? rules.goldenPoint() : rules.okPoint();
    }

    private void validateHeats(List<Integer> heats, BungeoppangV4Responses.Rules rules) {
        if (heats.isEmpty() || heats.stream().anyMatch(value -> value == null
                || value < rules.heatMin() || value > rules.heatMax())) {
            throw invalid("BAD_HEAT_SOURCE", -1);
        }
    }

    private void validateCommon(Action entry, int index, int previous, BungeoppangV4Responses.Rules rules) {
        if (entry == null || entry.seq() != index + 1 || entry.action() == null
                || entry.t() < 0 || entry.t() >= rules.durationMs()) {
            throw invalid("BAD_ENTRY", index);
        }
        if (previous >= 0 && entry.t() < previous) { throw invalid("TIME_REVERSED", index); }
        if (previous >= 0 && entry.t() - previous < rules.minGapMs()) {
            throw invalid("TOO_FAST", index);
        }
    }

    private static void requireRules(BungeoppangV4Responses.Rules rules) {
        if (rules == null) { throw new IllegalArgumentException("규칙 설정이 필요합니다."); }
    }

    private void requireFields(Action entry, boolean slot, boolean filling, boolean bread,
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
