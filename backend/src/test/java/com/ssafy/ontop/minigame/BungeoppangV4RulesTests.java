package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Action;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Filling;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts;
import com.ssafy.ontop.minigame.service.BungeoppangV4Rules.Order;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
import com.ssafy.ontop.minigame.service.MinigameException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BungeoppangV4RulesTests {
    private final BungeoppangV4Rules rules = new BungeoppangV4Rules();

    @ParameterizedTest
    @CsvSource({
            "49,RAW", "50,GOOD", "69,GOOD", "70,PERFECT", "90,PERFECT",
            "91,GOOD", "99,GOOD", "100,BURNT"
    })
    void 품질_경계는_FE_v4와_같다(int cooked, BungeoppangV4Rules.Quality quality) {
        assertThat(BungeoppangV4Rules.quality(cooked)).isEqualTo(quality);
    }

    @ParameterizedTest
    @CsvSource({
            "0,6400,85,68",
            "0,6400,100,80",
            "0,6400,115,92",
            "38000,42000,100,58",
            "0,5600,100,70",
            "0,5600,85,59",
            "0,5600,115,80",
            "40000,44200,100,70",
            "38000,43000,100,75",
            "0,59999,100,833"
    })
    void 불세기와_40초_가속을_정수_내림으로_계산한다(
            int since, int at, int heat, int expected) {
        assertThat(BungeoppangV4Rules.doneness(since, at, heat)).isEqualTo(expected);
    }

    @Test
    void 한_FILL의_불은_앞뒤에_같이_쓰고_FILL마다_하나씩_소비한다() {
        var log = List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 300, 0, Filling.BEAN),
                Action.turn(3, 5_900, 0),
                Action.turn(4, 11_500, 0));

        var result = rules.replay(log, List.of(85), orders(order(0, 1, 0, 0, 0)));

        assertThat(result.heatCursor()).isOne();
        assertThat(result.tray()).singleElement().satisfies(bread -> {
            assertThat(bread.front()).isEqualTo(59);
            assertThat(bread.back()).isEqualTo(59);
            assertThat(bread.filling()).isEqualTo(Filling.BEAN);
        });
        assertThat(result.score()).isZero();
    }

    @Test
    void 콤보_3단계와_6단계_배율은_빵별_정수_내림으로_적용된다() {
        List<Action> log = new ArrayList<>();
        int seq = 1;
        int start = 0;
        List<Order> orders = new ArrayList<>();
        for (int batch = 0; batch < 3; batch++) {
            log.add(Action.pour(seq++, start, 0));
            log.add(Action.pour(seq++, start + 50, 1));
            log.add(Action.fill(seq++, start + 300, 0, Filling.BEAN));
            log.add(Action.fill(seq++, start + 350, 1, Filling.BEAN));
            log.add(Action.turn(seq++, start + 5_900, 0));
            log.add(Action.turn(seq++, start + 5_950, 1));
            log.add(Action.turn(seq++, start + 11_500, 0));
            log.add(Action.turn(seq++, start + 11_550, 1));
            log.add(Action.deliver(seq++, start + 11_600, Integer.toString(batch + 1), "d" + batch));
            orders.add(order(batch, 2, 0, 0, 0));
            start += 11_900;
        }

        var result = rules.replay(log, Collections.nCopies(6, 100), orders);

        assertThat(result.score()).isEqualTo(71);
        assertThat(result.maxCombo()).isEqualTo(6);
        assertThat(result.combo()).isEqualTo(6);
        assertThat(result.served()).isEqualTo(6);
        assertThat(result.customersServed()).isEqualTo(3);
        assertThat(result.tray()).isEmpty();
    }

    @Test
    void 네가지_소를_FIFO로_납품하고_특수재료_보너스를_빵별로_내림한다() {
        List<Action> log = new ArrayList<>();
        Filling[] fillings = Filling.values();
        int seq = 1;
        for (int slot = 0; slot < fillings.length; slot++) {
            log.add(Action.pour(seq++, slot * 50, slot));
        }
        for (int slot = 0; slot < fillings.length; slot++) {
            log.add(Action.fill(seq++, 300 + slot * 50, slot, fillings[slot]));
        }
        for (int slot = 0; slot < fillings.length; slot++) {
            log.add(Action.turn(seq++, 5_900 + slot * 50, slot));
        }
        for (int slot = 0; slot < fillings.length; slot++) {
            log.add(Action.turn(seq++, 11_500 + slot * 50, slot));
        }
        log.add(Action.deliver(seq, 11_800, "1", "all-fillings"));

        var result = rules.replay(log, Collections.nCopies(4, 100),
                orders(order(0, 1, 1, 1, 1)));

        assertThat(result.score()).isEqualTo(56);
        assertThat(result.bonusScore()).isEqualTo(12);
        assertThat(result.served()).isEqualTo(4);
        assertThat(result.specialServed()).isEqualTo(2);
        assertThat(result.tray()).isEmpty();
        assertThat(result.currentOrder()).isNull();
    }

    @Test
    void 홀수점수_특수빵은_각_빵마다_보너스를_내림한다() {
        List<Action> log = List.of(
                Action.pour(1, 0, 0),
                Action.pour(2, 50, 1),
                Action.fill(3, 300, 0, Filling.PIZZA),
                Action.fill(4, 350, 1, Filling.CHOCOLATE),
                Action.turn(5, 5_900, 0),
                Action.turn(6, 5_950, 1),
                Action.turn(7, 10_700, 0),
                Action.turn(8, 10_750, 1),
                Action.deliver(9, 10_800, "1", "odd-specials"));

        var result = rules.replay(log, List.of(100, 100),
                orders(order(0, 0, 0, 1, 1)));

        assertThat(result.bonusScore()).isEqualTo(6);
        assertThat(result.score()).isEqualTo(20);
        assertThat(result.served()).isEqualTo(2);
    }

    @Test
    void 주문보다_많이_만든_동일_소는_가장_먼저_만든_빵부터_쓰고_여분은_남긴다() {
        List<Action> log = List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 300, 0, Filling.BEAN),
                Action.turn(3, 5_900, 0),
                Action.turn(4, 11_500, 0),
                Action.pour(5, 11_800, 0),
                Action.fill(6, 12_100, 0, Filling.BEAN),
                Action.turn(7, 16_100, 0),
                Action.turn(8, 20_100, 0),
                Action.deliver(9, 20_150, "1", "fifo"));

        var result = rules.replay(log, List.of(100, 100), orders(order(0, 1, 0, 0, 0)));

        assertThat(result.score()).isEqualTo(10);
        assertThat(result.tray()).singleElement().satisfies(bread -> {
            assertThat(bread.breadId()).isEqualTo(2);
            assertThat(bread.points()).isEqualTo(4);
        });
    }

    @Test
    void 쟁반은_성공빵_네개까지만_보관하고_납품전에는_점수가_오르지_않는다() {
        List<Action> four = cookFourPerfect();
        var result = rules.replay(four, Collections.nCopies(5, 100),
                orders(order(0, 4, 0, 0, 0)));
        assertThat(result.tray()).hasSize(4);
        assertThat(result.score()).isZero();

        List<Action> five = new ArrayList<>(four);
        int seq = five.size() + 1;
        five.add(Action.pour(seq++, 11_900, 4));
        five.add(Action.fill(seq++, 12_200, 4, Filling.BEAN));
        five.add(Action.turn(seq++, 17_800, 4));
        five.add(Action.turn(seq, 23_400, 4));
        assertThatThrownBy(() -> rules.replay(five, Collections.nCopies(5, 100),
                orders(order(0, 4, 0, 0, 0))))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.detail()).isEqualTo("TRAY_FULL"));
    }

    @Test
    void 쟁반이_가득차도_실패빵은_제거하고_기존쟁반을_유지한다() {
        List<Action> log = new ArrayList<>(cookFourPerfect());
        int seq = log.size() + 1;
        log.add(Action.pour(seq++, 11_900, 4));
        log.add(Action.fill(seq++, 12_200, 4, Filling.BEAN));
        log.add(Action.turn(seq++, 15_200, 4));
        log.add(Action.turn(seq, 18_200, 4));

        var result = rules.replay(log, Collections.nCopies(5, 100),
                orders(order(0, 4, 0, 0, 0)));

        assertThat(result.tray()).hasSize(4);
        assertThat(result.made()).isEqualTo(5);
        assertThat(result.successfulMade()).isEqualTo(4);
        assertThat(result.failed()).isOne();
        assertThat(result.score()).isZero();
    }

    @Test
    void 실패빵은_제거하고_철판과_쟁반_폐기를_각각_기록한다() {
        List<Action> log = List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 300, 0, Filling.BEAN),
                Action.turn(3, 3_300, 0),
                Action.turn(4, 6_300, 0),
                Action.pour(5, 6_600, 0),
                Action.fill(6, 6_900, 0, Filling.CUSTARD),
                Action.discard(7, 7_200, 0),
                Action.pour(8, 7_500, 0),
                Action.fill(9, 7_800, 0, Filling.PIZZA),
                Action.turn(10, 13_400, 0),
                Action.turn(11, 19_000, 0),
                Action.trayDiscard(12, 19_050, 2));

        var result = rules.replay(log, List.of(100, 100, 100),
                orders(order(0, 1, 0, 0, 0)));

        assertThat(result.made()).isEqualTo(2);
        assertThat(result.failed()).isOne();
        assertThat(result.grillDiscarded()).isOne();
        assertThat(result.trayDiscarded()).isOne();
        assertThat(result.wasted()).isEqualTo(2);
        assertThat(result.heatCursor()).isEqualTo(3);
        assertThat(result.tray()).isEmpty();
    }

    @Test
    void 첫주문은_팥두개이고_후속주문은_총수량_1부터4와_네종류를_지킨다() {
        assertThat(rules.nextOrder(0, new Random(7))).isEqualTo(order(0, 2, 0, 0, 0));

        Random random = new Random(7);
        boolean sawSpecial = false;
        for (int index = 1; index <= 1_000; index++) {
            Order generated = rules.nextOrder(index, random);
            int total = generated.items().bean() + generated.items().custard()
                    + generated.items().pizza() + generated.items().chocolate();
            assertThat(generated.orderIndex()).isEqualTo(index);
            assertThat(generated.orderId()).isEqualTo(Integer.toString(index + 1));
            assertThat(total).isBetween(1, 4);
            assertThat(generated.items().bean()).isNotNegative();
            assertThat(generated.items().custard()).isNotNegative();
            assertThat(generated.items().pizza()).isNotNegative();
            assertThat(generated.items().chocolate()).isNotNegative();
            sawSpecial |= generated.items().pizza() > 0 || generated.items().chocolate() > 0;
        }
        assertThat(sawSpecial).isTrue();
    }

    @Test
    void 잘못된_주문_수량과_식별자는_거절한다() {
        assertBadOrder(new Order("1", 0, new FillingCounts(0, 0, 0, 0)), 0);
        assertBadOrder(new Order("1", 0, new FillingCounts(5, 0, 0, 0)), 0);
        assertBadOrder(new Order("1", 0, new FillingCounts(-1, 2, 0, 0)), 0);
        assertBadOrder(new Order("1", 0,
                new FillingCounts(Integer.MAX_VALUE, Integer.MAX_VALUE, 0, 0)), 0);
        assertBadOrder(new Order("2", 0, new FillingCounts(1, 0, 0, 0)), 0);
        assertBadOrder(new Order("1", 1, new FillingCounts(1, 0, 0, 0)), 0);
    }

    @Test
    void 행동시각_59999는_허용하고_60000은_거절한다() {
        var accepted = rules.replay(List.of(Action.pour(1, 59_999, 0)), List.of(100),
                orders(order(0, 2, 0, 0, 0)));
        assertThat(accepted.score()).isZero();

        assertThatThrownBy(() -> rules.replay(List.of(Action.pour(1, 60_000, 0)), List.of(100),
                orders(order(0, 2, 0, 0, 0))))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.detail()).isEqualTo("BAD_ENTRY"));
    }

    @Test
    void 명시적_규칙_경로는_현재_전역설정이_아니라_전달받은_스냅샷을_사용한다() {
        List<Action> log = List.of(
                Action.pour(1, 0, 0),
                Action.fill(2, 300, 0, Filling.BEAN),
                Action.turn(3, 5_900, 0),
                Action.turn(4, 11_500, 0),
                Action.deliver(5, 11_550, "1", "snapshot"));
        List<Integer> heats = List.of(100);
        List<Order> issuedOrders = orders(order(0, 1, 0, 0, 0));

        var storedSnapshot = rulesWith(
                new BungeoppangV4Responses.FillingCounts(0, 2, 0, 0), 9);
        var defaultResult = rules.replay(log, heats, issuedOrders);
        var storedSnapshotResult = rules.replay(log, heats, issuedOrders, storedSnapshot);

        assertThat(defaultResult.score()).isEqualTo(10);
        assertThat(storedSnapshotResult.score()).isEqualTo(18);
        assertThat(rules.nextOrder(0, new Random(7), storedSnapshot))
                .isEqualTo(order(0, 0, 2, 0, 0));
    }

    private List<Action> cookFourPerfect() {
        List<Action> log = new ArrayList<>();
        int seq = 1;
        for (int slot = 0; slot < 4; slot++) {
            log.add(Action.pour(seq++, slot * 50, slot));
        }
        for (int slot = 0; slot < 4; slot++) {
            log.add(Action.fill(seq++, 300 + slot * 50, slot, Filling.BEAN));
        }
        for (int slot = 0; slot < 4; slot++) {
            log.add(Action.turn(seq++, 5_900 + slot * 50, slot));
        }
        for (int slot = 0; slot < 4; slot++) {
            log.add(Action.turn(seq++, 11_500 + slot * 50, slot));
        }
        return log;
    }

    private static List<Order> orders(Order... orders) {
        return List.of(orders);
    }

    private static Order order(int index, int bean, int custard, int pizza, int chocolate) {
        return new Order(Integer.toString(index + 1), index,
                new FillingCounts(bean, custard, pizza, chocolate));
    }

    private static BungeoppangV4Responses.Rules rulesWith(
            BungeoppangV4Responses.FillingCounts firstOrder, int goldenPoint) {
        var current = BungeoppangV4Spec.rules();
        return new BungeoppangV4Responses.Rules(
                current.slots(), current.durationMs(), current.countdownMs(), current.sideMs(),
                current.rushSideMs(), current.rushFromMs(), current.heatMin(), current.heatMax(),
                current.heatListLength(), current.trayCapacity(), current.maxOrderItems(),
                current.specialOrderChancePercent(), current.specialBonusPercent(), firstOrder,
                current.okFrom(), current.goldenFrom(), current.goldenTo(),
                current.burntFrom(), current.okPoint(), goldenPoint, current.pointsPerCoin(),
                current.dailyCoinCap(), current.minGapMs(), current.sameSlotGapMs(),
                current.maxLogEntries());
    }

    private void assertBadOrder(Order order, int expectedIndex) {
        assertThatThrownBy(() -> rules.validateOrder(order, expectedIndex))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.detail()).isEqualTo("BAD_ORDER"));
    }
}
