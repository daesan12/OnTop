package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Action;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Filling;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts;
import com.ssafy.ontop.minigame.service.BungeoppangV5Rules;
import com.ssafy.ontop.minigame.service.BungeoppangV5Rules.Order;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.minigame.service.MinigameException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BungeoppangV5RulesTests {
    @ParameterizedTest
    @CsvSource({"PIZZA", "CHOCOLATE"})
    void 특수소_보너스는_새판에서_30퍼센트이고_기존_저장규칙은_50퍼센트를_유지한다(Filling filling) {
        var items = filling == Filling.PIZZA ? new FillingCounts(0, 0, 1, 0) : new FillingCounts(0, 0, 0, 1);
        var issued = List.of(new Order("1", 0, 0, items));
        var log = List.of(Action.pour(1, 0, 0), Action.fill(2, 300, 0, filling),
                Action.turn(3, 6_700, 0), Action.turn(4, 13_100, 0),
                Action.deliver(5, 13_150, "1", "special-delivery"));

        var current = rules.replay(log, heats(100), issued);
        var previous = legacy.replay(log, heats(100), issued);

        assertThat(current.score()).isEqualTo(13);
        assertThat(current.bonusScore()).isEqualTo(3);
        assertThat(previous.score()).isEqualTo(15);
        assertThat(previous.bonusScore()).isEqualTo(5);
    }

    @Test
    void 세번째_뒤_손님을_먼저_제공하면_대기_손님마다_한번만_5점을_감점한다() {
        var items = new FillingCounts(1, 0, 0, 0);
        var issued = new ArrayList<>(List.of(new Order("1", 0, 0, items), new Order("3", 1, 0, items),
                new Order("9", 2, 0, items)));
        var log = new ArrayList<Action>();
        String[] customers = {"3", "15", "20", "38"};
        for (int i = 0; i < customers.length; i++) {
            int t = i * 14_000;
            log.add(Action.pour(log.size() + 1, t, 0));
            log.add(Action.fill(log.size() + 1, t + 300, 0, Filling.BEAN));
            log.add(Action.turn(log.size() + 1, t + 6_700, 0));
            log.add(Action.turn(log.size() + 1, t + 13_100, 0));
            log.add(new Action(log.size() + 1, "DELIVER", t + 13_150, null, null, null,
                    customers[i], "delivery-" + i));
            if (i < customers.length - 1) {
                issued.add(new Order(customers[i + 1], 1, log.size(), items));
            }
        }

        var engine = new BungeoppangV5Rules();
        var snapshot = BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.rules());
        var normal = engine.replay(log, Collections.nCopies(4, 100), issued, snapshot);
        var result = engine.replay(log, Collections.nCopies(4, 100), issued, snapshot, 5);

        assertThat(result.score()).isEqualTo(normal.score() - 10);
        assertThat(result.complainedOrderIds()).containsExactly("1", "9");
        assertThat(engine.replay(log.subList(0, 5), Collections.nCopies(4, 100), issued, snapshot, 5).complainedOrderIds()).isEmpty();
        assertThat(engine.replay(log.subList(0, 15), Collections.nCopies(4, 100), issued, snapshot, 5).complainedOrderIds())
                .containsExactly("1");
    }
    /** New rounds: 120 s, rush from 90 s. Cases that do not depend on the play length use this snapshot. */
    private final Replay rules = new Replay(BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.rules()));
    /** Rounds stored with v5-20261027.1: 180 s, rush from 150 s. */
    private final Replay legacy = new Replay(BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.legacyRules()));

    /** The engine with one round's rules snapshot, as the service passes the stored one. */
    private record Replay(BungeoppangV4Responses.Rules snapshot) {
        BungeoppangV5Rules.Result replay(List<Action> log, List<Integer> heats, List<Order> issued) {
            return new BungeoppangV5Rules().replay(log, heats, issued, snapshot);
        }
    }

    @Test
    void FILL부터_가열해_2000ms_FILL_6400ms_TURN의_앞면은_55다() {
        var result = rules.replay(List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 2_000, 0, Filling.BEAN),
                Action.turn(3, 6_400, 0)), heats(100), opening());

        assertThat(result.heatCursor()).isOne();
        assertThat(result.slots().getFirst()).satisfies(slot -> {
            assertThat(slot.phase()).isEqualTo("back");
            assertThat(slot.front()).isEqualTo(55);
            assertThat(slot.since()).isEqualTo(6_400);
            assertThat(slot.heat()).isEqualTo(100);
        });
    }

    @ParameterizedTest
    @CsvSource({"85,68", "100,80", "115,92"})
    void 불세기별로_FILL_후_6400ms_익힘을_계산한다(int heat, int expected) {
        var result = rules.replay(List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 300, 0, Filling.BEAN),
                Action.turn(3, 6_700, 0)), heats(heat), opening());

        assertThat(result.slots().getFirst().front()).isEqualTo(expected);
    }

    @Test
    void 반죽은_불을_쓰지_않아_8000ms_뒤에도_FILL하고_그때부터_익는다() {
        var poured = rules.replay(List.of(Action.pour(1, 0, 0)), heats(100), opening());
        assertThat(poured.heatCursor()).isZero();
        assertThat(poured.slots().getFirst()).satisfies(slot -> {
            assertThat(slot.phase()).isEqualTo("batter");
            assertThat(slot.since()).isZero();
            assertThat(slot.heat()).isEqualTo(100);
        });

        var result = rules.replay(List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 8_000, 0, Filling.BEAN),
                Action.turn(3, 14_400, 0)), heats(100), opening());

        assertThat(result.heatCursor()).isOne();
        assertThat(result.slots().getFirst().front()).isEqualTo(80);
    }

    @Test
    void 반죽_TURN은_거절하고_반죽_폐기는_불과_실패를_남기지_않는다() {
        assertRejected(List.of(Action.pour(1, 0, 0), Action.turn(2, 8_000, 0)), heats(100),
                "ACTION_STATE_MISMATCH", 1);

        var result = rules.replay(List.of(Action.pour(1, 0, 0), Action.discard(2, 16_000, 0)),
                heats(100), opening());
        assertThat(result.heatCursor()).isZero();
        assertThat(result.failed()).isZero();
        assertThat(result.wasted()).isOne();
        assertThat(result.grillDiscarded()).isOne();
        assertThat(result.made()).isZero();
    }

    @Test
    void 탄_앞면의_FILL과_TURN은_거절하고_DISCARD만_실패와_폐기로_남긴다() {
        var filled = List.of(Action.pour(1, 0, 0), Action.fill(2, 300, 0, Filling.BEAN));
        assertRejected(append(filled, Action.turn(3, 8_300, 0)), heats(100), "BURNT_BREAD", 2);
        assertRejected(append(filled, Action.fill(3, 8_300, 0, Filling.BEAN)), heats(100), "BURNT_BREAD", 2);

        var result = rules.replay(append(filled, Action.discard(3, 8_300, 0)), heats(100), opening());
        assertThat(result.failed()).isOne();
        assertThat(result.wasted()).isOne();
        assertThat(result.made()).isZero();
        assertThat(result.combo()).isZero();
        assertThat(result.heatCursor()).isOne();
        assertThat(result.tray()).isEmpty();
        assertThat(result.slots().getFirst().phase()).isEqualTo("empty");
    }

    @Test
    void 탄_뒷면도_TURN을_거절하고_DISCARD는_실패로_센다() {
        var flipped = List.of(Action.pour(1, 0, 0), Action.fill(2, 300, 0, Filling.BEAN),
                Action.turn(3, 6_700, 0));
        assertRejected(append(flipped, Action.turn(4, 14_700, 0)), heats(100), "BURNT_BREAD", 3);

        var result = rules.replay(append(flipped, Action.discard(4, 14_700, 0)), heats(100), opening());
        assertThat(result.failed()).isOne();
        assertThat(result.wasted()).isOne();
    }

    @Test
    void 불115의_탄_경계는_6956ms_99와_6957ms_100이다() {
        var filled = List.of(Action.pour(1, 0, 0), Action.fill(2, 300, 0, Filling.BEAN));

        var result = rules.replay(append(filled, Action.turn(3, 300 + 6_956, 0)), heats(115), opening());
        assertThat(result.slots().getFirst().front()).isEqualTo(99);
        assertRejected(append(filled, Action.turn(3, 300 + 6_957, 0)), heats(115), "BURNT_BREAD", 2);
    }

    @Test
    void 신규_2분_판의_마지막_30초_가속은_88000ms부터_92000ms까지_58이다() {
        var result = rules.replay(List.of(
                Action.pour(1, 87_000, 0),
                Action.fill(2, 88_000, 0, Filling.BEAN),
                Action.turn(3, 92_000, 0)), heats(100), opening());

        assertThat(result.slots().getFirst().front()).isEqualTo(58);
    }

    @Test
    void 기존_3분_판의_마지막_30초_가속은_148000ms부터_152000ms까지_58이다() {
        var result = legacy.replay(List.of(
                Action.pour(1, 147_000, 0),
                Action.fill(2, 148_000, 0, Filling.BEAN),
                Action.turn(3, 152_000, 0)), heats(100), opening());

        assertThat(result.slots().getFirst().front()).isEqualTo(58);
    }

    /** 6000 ms of cooking: all normal is 75, one normal ms then rush is 99, all rush burns at 100. */
    @ParameterizedTest
    @CsvSource({"90000,true", "150000,false"})
    void 가속은_판의_rushFromMs_정각부터_적용하고_그_전_1ms는_평시다(int rushFrom, boolean twoMinute) {
        Replay replay = twoMinute ? rules : legacy;

        assertThat(replay.replay(bread(rushFrom - 6_001, rushFrom - 1), heats(100), opening())
                .slots().getFirst().front()).isEqualTo(75);
        assertThat(replay.replay(bread(rushFrom - 1, rushFrom + 5_999), heats(100), opening())
                .slots().getFirst().front()).isEqualTo(99);
        assertThatThrownBy(() -> replay.replay(bread(rushFrom, rushFrom + 6_000), heats(100), opening()))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.detail()).isEqualTo("BURNT_BREAD"));
    }

    @Test
    void 기존_3분_판은_120초_이후_행동을_받고_같은_로그를_2분_규칙은_거절한다() {
        var log = List.of(Action.pour(1, 120_000, 0), Action.fill(2, 120_300, 0, Filling.BEAN),
                Action.turn(3, 126_700, 0));

        assertThat(legacy.replay(log, heats(100), opening()).slots().getFirst().front()).isEqualTo(80);
        assertRejected(rules, log, heats(100), opening(), "BAD_ENTRY", 0);
    }

    /** Eleven breads made one after another end at 145.1 s, so this uses the 180 s snapshot; both hold 10. */
    @Test
    void 쟁반은_10개까지_허용하고_11번째_완성품은_거절한다() {
        List<Action> ten = goldenBreads(10);
        var result = legacy.replay(ten, heats(100, 20), opening());
        assertThat(result.tray()).hasSize(10);
        assertThat(result.tray()).extracting(bread -> bread.breadId())
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L);

        assertRejected(legacy, goldenBreads(11), heats(100, 20), opening(), "TRAY_FULL", 43);
        assertThat(BungeoppangV5Spec.rules().trayCapacity()).isEqualTo(BungeoppangV5Spec.legacyRules().trayCapacity());
    }

    @Test
    void 활성_주문_3건_중_선두가_아닌_주문을_선택해_종류별_먼저_만든_빵부터_납품한다() {
        var log = new ArrayList<>(goldenBreads(2, Filling.BEAN));
        log.add(Action.deliver(9, 30_000, "2", "delivery-two"));

        var result = rules.replay(log, heats(100, 4), opening());

        assertThat(result.activeOrders()).extracting(Order::orderId).containsExactly("1", "3");
        assertThat(result.customersServed()).isOne();
        assertThat(result.served()).isOne();
        assertThat(result.tray()).singleElement().satisfies(bread -> assertThat(bread.breadId()).isEqualTo(2L));
        assertThat(result.score()).isEqualTo(10);
    }

    @Test
    void 충원_주문은_납품이_승인된_seq_뒤에_같은_손님_자리로만_활성화된다() {
        var history = new ArrayList<>(opening());
        history.add(order("4", 1, 9, 0, 1, 0, 0));
        var prefix = new ArrayList<>(goldenBreads(2, Filling.BEAN));

        assertThat(rules.replay(prefix, heats(100, 4), history).activeOrders())
                .extracting(Order::orderId).containsExactly("1", "2", "3");

        var early = append(prefix, Action.deliver(9, 30_000, "4", "delivery-four"));
        assertRejected(early, heats(100, 4), history, "STALE_ORDER", 8);

        var delivered = append(prefix, Action.deliver(9, 30_000, "2", "delivery-two"));
        var result = rules.replay(delivered, heats(100, 4), history);
        assertThat(result.activeOrders()).extracting(Order::orderId).containsExactly("1", "3", "4");
        assertThat(result.activeOrders()).extracting(Order::customerSlot).containsExactly(0, 2, 1);

        var again = append(delivered, Action.deliver(10, 30_050, "2", "delivery-again"));
        assertRejected(again, heats(100, 4), history, "STALE_ORDER", 9);

        var wrongSeat = new ArrayList<>(opening());
        wrongSeat.add(order("4", 0, 9, 0, 1, 0, 0));
        assertRejected(delivered, heats(100, 4), wrongSeat, "BAD_ORDER", 8);
    }

    @Test
    void 주문_전체_수량이_부족하면_납품을_거절한다() {
        var log = append(goldenBreads(1, Filling.BEAN), Action.deliver(5, 20_000, "1", "delivery-one"));
        assertRejected(log, heats(100, 4), opening(), "ORDER_NOT_READY", 4);
    }

    @Test
    void 서버_불_목록을_다_쓰면_다음_FILL을_거절한다() {
        var log = List.of(
                Action.pour(1, 0, 0), Action.fill(2, 300, 0, Filling.BEAN),
                Action.pour(3, 350, 1), Action.fill(4, 650, 1, Filling.BEAN));
        assertRejected(log, List.of(100), "TOO_MANY_FILLS", 3);
    }

    @Test
    void 처음_주문은_손님_자리가_겹치거나_범위를_벗어나면_거절한다() {
        var duplicate = List.of(order("1", 0, 0, 2, 0, 0, 0), order("2", 0, 0, 1, 0, 0, 0));
        var outside = List.of(order("1", 3, 0, 2, 0, 0, 0));
        var notDecimal = List.of(order("01", 0, 0, 2, 0, 0, 0));

        for (var history : List.of(duplicate, outside, notDecimal)) {
            assertThatThrownBy(() -> rules.replay(List.of(), heats(100), history))
                    .isInstanceOfSatisfying(MinigameException.class,
                            error -> assertThat(error.detail()).isEqualTo("BAD_ORDER"));
        }
    }

    /** 3600 actions 50 ms apart need the 180 s window; the 3600 limit itself is the same in both snapshots. */
    @Test
    void 로그는_3600건까지_받고_3601건째는_거절한다() {
        var log = new ArrayList<Action>();
        for (int i = 0; i < 3_600; i++) {
            int slot = i % 6;
            boolean pour = (i / 6) % 2 == 0;
            log.add(pour ? Action.pour(i + 1, i * 50, slot) : Action.discard(i + 1, i * 50, slot));
        }

        var result = legacy.replay(log, heats(100), opening());
        assertThat(result.lastAt()).isEqualTo(179_950);
        assertThat(result.grillDiscarded()).isEqualTo(1_800);
        assertThat(result.failed()).isZero();
        assertThat(result.heatCursor()).isZero();

        assertRejected(legacy, append(log, Action.pour(3_601, 179_999, 0)), heats(100), opening(),
                "LOG_TOO_LONG", -1);
        assertRejected(append(log, Action.pour(3_601, 179_999, 0)), heats(100), "LOG_TOO_LONG", -1);
    }

    @Test
    void 신규_2분_판의_행동_시각은_120초_직전까지만_받는다() {
        var result = rules.replay(List.of(Action.pour(1, 119_999, 0)), heats(100), opening());
        assertThat(result.slots().getFirst().phase()).isEqualTo("batter");

        assertRejected(List.of(Action.pour(1, 120_000, 0)), heats(100), "BAD_ENTRY", 0);
    }

    @Test
    void 기존_3분_판의_행동_시각은_180초_직전까지만_받는다() {
        var result = legacy.replay(List.of(Action.pour(1, 179_999, 0)), heats(100), opening());
        assertThat(result.slots().getFirst().phase()).isEqualTo("batter");

        assertRejected(legacy, List.of(Action.pour(1, 180_000, 0)), heats(100), opening(), "BAD_ENTRY", 0);
    }

    @Test
    void 시간_역행과_전체_50ms_같은_칸_300ms_간격을_검사한다() {
        assertRejected(List.of(Action.pour(1, 1_000, 0), Action.pour(2, 900, 1)), heats(100),
                "TIME_REVERSED", 1);
        assertRejected(List.of(Action.pour(1, 0, 0), Action.pour(2, 49, 1)), heats(100), "TOO_FAST", 1);
        assertRejected(List.of(Action.pour(1, 0, 0), Action.discard(2, 299, 0)), heats(100),
                "SAME_SLOT_TOO_FAST", 1);

        var result = rules.replay(List.of(Action.pour(1, 0, 0), Action.pour(2, 50, 1), Action.discard(3, 300, 0)),
                heats(100), opening());
        assertThat(result.grillDiscarded()).isOne();
    }

    @Test
    void 쟁반의_빵_하나를_버리면_폐기로_세고_콤보를_끊으며_남은_빵으로_납품한다() {
        var log = append(goldenBreads(2), Action.trayDiscard(9, 30_000, 1));

        var discarded = rules.replay(log, heats(100, 4), opening());
        assertThat(discarded.tray()).extracting(bread -> bread.breadId()).containsExactly(2L);
        assertThat(discarded.trayDiscarded()).isOne();
        assertThat(discarded.wasted()).isOne();
        assertThat(discarded.combo()).isZero();
        assertThat(discarded.maxCombo()).isEqualTo(2);
        assertThat(discarded.failed()).isZero();

        var delivered = rules.replay(append(log, Action.deliver(10, 30_050, "2", "delivery-two")),
                heats(100, 4), opening());
        assertThat(delivered.tray()).isEmpty();
        assertThat(delivered.customersServed()).isOne();

        assertRejected(append(goldenBreads(2), Action.trayDiscard(9, 30_000, 9)), heats(100, 4),
                "ACTION_STATE_MISMATCH", 8);
    }

    @Test
    void 납품_키가_없는_DELIVER는_입력_오류다() {
        var log = append(goldenBreads(1), Action.deliver(5, 20_000, "2", null));
        assertRejected(log, heats(100, 4), "BAD_ENTRY", 4);
    }

    @Test
    void 납품이_아닌_행동_뒤나_같은_seq에_두_건인_충원_이력은_거절한다() {
        var afterFill = new ArrayList<>(opening());
        afterFill.add(order("4", 1, 2, 0, 1, 0, 0));
        assertRejected(List.of(Action.pour(1, 0, 0), Action.fill(2, 300, 0, Filling.BEAN)), heats(100),
                afterFill, "BAD_ORDER", 1);

        var twice = new ArrayList<>(opening());
        twice.add(order("4", 1, 9, 0, 1, 0, 0));
        twice.add(order("5", 1, 9, 1, 0, 0, 0));
        var delivered = append(goldenBreads(2), Action.deliver(9, 30_000, "2", "delivery-two"));
        assertRejected(delivered, heats(100, 4), twice, "BAD_ORDER", 8);
    }

    /** Golden breads made one at a time with heat 100: front 80 and back 80. */
    private static List<Action> goldenBreads(int count) {
        return goldenBreads(count, Filling.BEAN);
    }

    private static List<Action> goldenBreads(int count, Filling filling) {
        var log = new ArrayList<Action>();
        for (int i = 0; i < count; i++) {
            int start = i * 13_200;
            int slot = i % 6;
            log.add(Action.pour(log.size() + 1, start, slot));
            log.add(Action.fill(log.size() + 1, start + 300, slot, filling));
            log.add(Action.turn(log.size() + 1, start + 6_700, slot));
            log.add(Action.turn(log.size() + 1, start + 13_100, slot));
        }
        return log;
    }

    private void assertRejected(List<Action> log, List<Integer> heats, String detail, int index) {
        assertRejected(log, heats, opening(), detail, index);
    }

    private void assertRejected(List<Action> log, List<Integer> heats, List<Order> history, String detail,
            int index) {
        assertRejected(rules, log, heats, history, detail, index);
    }

    private static void assertRejected(Replay replay, List<Action> log, List<Integer> heats, List<Order> history,
            String detail, int index) {
        assertThatThrownBy(() -> replay.replay(log, heats, history))
                .isInstanceOfSatisfying(MinigameException.class, error -> {
                    assertThat(error.status()).isEqualTo(422);
                    assertThat(error.detail()).isEqualTo(detail);
                    assertThat(error.index()).isEqualTo(index);
                });
    }

    /** A bean on slot 0 poured 300 ms before {@code fill} and turned at {@code turn}. */
    private static List<Action> bread(int fill, int turn) {
        return List.of(Action.pour(1, fill - 300, 0), Action.fill(2, fill, 0, Filling.BEAN),
                Action.turn(3, turn, 0));
    }

    private static List<Action> append(List<Action> log, Action action) {
        var next = new ArrayList<>(log);
        next.add(action);
        return next;
    }

    private static List<Integer> heats(int heat) {
        return List.of(heat);
    }

    private static List<Integer> heats(int heat, int count) {
        return Collections.nCopies(count, heat);
    }

    /** The FE common fixture's opening customers. */
    private static List<Order> opening() {
        return List.of(order("1", 0, 0, 2, 0, 0, 0), order("2", 1, 0, 1, 0, 0, 0),
                order("3", 2, 0, 0, 1, 0, 0));
    }

    private static Order order(String id, int customerSlot, int availableAfterSeq, int bean, int custard,
            int pizza, int chocolate) {
        return new Order(id, customerSlot, availableAfterSeq, new FillingCounts(bean, custard, pizza, chocolate));
    }
}
