package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.skewer.coop.domain.SkewerCoopMatch;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SkewerCoopFeedbackTests {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void 착석_전에는_주문이_없고_접수도_거절하며_착석후_넓어진_거리에서_받을_수_있다() {
        var match = playing();
        ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(-6.2, 0));

        assertThat(match.privateView(101).at("/hall/tables/0/status").asText()).isEqualTo("arriving");
        assertThat(match.privateView(101).at("/hall/tables/0/bill").isNull()).isTrue();
        assertThatThrownBy(() -> match.act(101, mapper.valueToTree(Map.of("type", "INTERACT")), 3200))
                .hasMessage("INVALID_ACTION");
        for (long time = 3300; time <= 9500; time += 100) {
            match.tick(time, user -> true);
        }

        assertThat(match.privateView(101).at("/hall/tables/0/status").asText()).isEqualTo("unreceived");
        assertThat(match.privateView(101).at("/hall/tables/0/bill/dishes").size()).isEqualTo(1);
        match.act(101, mapper.valueToTree(Map.of("type", "INTERACT")), 9500);
        assertThat(match.privateView(101).at("/hall/held/0").asInt()).isEqualTo(1);
    }

    @Test
    void 상호작용_범위_밖은_여전히_거절한다() {
        var match = playing();
        ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(-5.9, 0));
        assertThatThrownBy(() -> match.act(101, mapper.valueToTree(Map.of("type", "INTERACT")), 3200))
                .hasMessage("INVALID_ACTION");
    }

    private SkewerCoopMatch playing() {
        var match = new SkewerCoopMatch("fixture", "park", 101, mapper, new Random(3), 0, 240);
        match.join(202);
        match.act(101, mapper.valueToTree(Map.of("type", "ROLE", "role", "server")), 0);
        match.act(202, mapper.valueToTree(Map.of("type", "ROLE", "role", "chef")), 0);
        match.act(101, mapper.valueToTree(Map.of("type", "READY", "ready", true)), 0);
        match.act(202, mapper.valueToTree(Map.of("type", "READY", "ready", true)), 0);
        for (long time = 100; time <= 3200; time += 100) {
            match.tick(time, user -> true);
        }
        return match;
    }

    @Test
    void 인사를_놓치면_실패_카드를_이초만_표시하고_완료_영점으로_안내하지_않는다() {
        var match = playing();
        double[] times = (double[]) ReflectionTestUtils.getField(match, "greetingAt");
        times[0] = (double) ReflectionTestUtils.getField(match, "elapsed") + .05;
        for (long time = 3300; time <= 8500; time += 100) match.tick(time, user -> true);
        assertThat(match.publicView(101).at("/greeting/outcome").asText()).isEqualTo("missed");
        assertThat(match.publicView(202).at("/greeting/bonus").asInt()).isZero();
        assertThat(match.publicView(101).path("message").asText()).doesNotContain("인사 완료");
        for (long time = 8600; time <= 10800; time += 100) match.tick(time, user -> true);
        assertThat(match.publicView(101).at("/greeting/outcome").asText()).isEmpty();
    }

    @Test
    void 두사람이_인사하면_확정_보너스를_양쪽에_같이_표시하고_역할은_바뀌지_않는다() {
        var match = playing();
        double[] times = (double[]) ReflectionTestUtils.getField(match, "greetingAt");
        times[0] = (double) ReflectionTestUtils.getField(match, "elapsed") + .05;
        match.tick(3300, user -> true);
        match.act(101, mapper.valueToTree(Map.of("type", "GREET")), 3300);
        match.act(202, mapper.valueToTree(Map.of("type", "GREET")), 3300);
        match.tick(3400, user -> true);
        assertThat(match.publicView(101).at("/greeting/outcome").asText()).isEqualTo("success");
        assertThat(match.publicView(101).at("/greeting/bonus").asInt()).isPositive();
        assertThat(match.publicView(101).path("greeting")).isEqualTo(match.publicView(202).path("greeting"));
        for (long time = 3500; time <= 5800; time += 100) {
            match.tick(time, user -> true);
            assertThat(match.privateView(101).path("role").asText()).isEqualTo("server");
            assertThat(match.privateView(202).path("role").asText()).isEqualTo("chef");
        }
        assertThat(match.publicView(101).at("/greeting/outcome").asText()).isEmpty();
    }

    @Test
    void 클릭_이동은_경유점을_지나도_남은_이동량을_사용한다() {
        var match = playing();
        ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(-2.75, 1.25));
        match.act(101, mapper.valueToTree(Map.of("type", "NAVIGATE", "x", 2.25, "z", 1.25)), 3200);

        for (long time = 3300; time <= 3900; time += 100) {
            double before = match.privateView(101).at("/hall/position/x").asDouble();
            match.tick(time, user -> true);
            double after = match.privateView(101).at("/hall/position/x").asDouble();
            assertThat(after - before).isCloseTo(.58, org.assertj.core.data.Offset.offset(.000001));
        }
    }

    @Test
    void 클릭_이동은_가구를_통과하지_않고_모든_테이블과_전달대에_도착한다() {
        var match = playing();
        var destinations = List.of(new SkewerCoopMatch.Point(-7.5, 0), new SkewerCoopMatch.Point(0, 0),
                new SkewerCoopMatch.Point(7.5, 0), new SkewerCoopMatch.Point(-7.5, 2.1),
                new SkewerCoopMatch.Point(0, 2.1), new SkewerCoopMatch.Point(7.5, 2.1),
                new SkewerCoopMatch.Point(-2.6, -4.25), new SkewerCoopMatch.Point(2.2, -4.25),
                new SkewerCoopMatch.Point(10, -4.25), new SkewerCoopMatch.Point(-6.4, -4.25),
                new SkewerCoopMatch.Point(6.6, -4.25));
        var arrivalTicks = new ArrayList<Integer>();

        for (var destination : destinations) {
            match.act(101, mapper.valueToTree(Map.of("type", "NAVIGATE", "x", destination.x(),
                    "z", destination.z())), 3200);
            int ticks = 0;
            double remaining;
            do {
                ReflectionTestUtils.invokeMethod(match, "move", .1);
                var position = (SkewerCoopMatch.Point) ReflectionTestUtils.getField(match, "position");
                assertThat((Boolean) ReflectionTestUtils.invokeMethod(match, "walkable", position)).isTrue();
                remaining = Math.hypot(position.x() - destination.x(), position.z() - destination.z());
                ticks++;
            } while (remaining > .000001 && ticks < 300);
            var position = (SkewerCoopMatch.Point) ReflectionTestUtils.getField(match, "position");
            assertThat(Math.hypot(position.x() - destination.x(), position.z() - destination.z())).isLessThan(.000001);
            arrivalTicks.add(ticks);
        }
        // 반복 상한 적용 전 같은 생성 경로에서 측정한 100ms 틱 수다.
        int[] previousTicks = {12, 15, 15, 35, 16, 16, 33, 10, 16, 33, 26};
        for (int index = 0; index < previousTicks.length; index++) {
            assertThat(arrivalTicks.get(index)).isLessThanOrEqualTo((int) Math.ceil(previousTicks[index] * 5.0 / 5.8) + 1);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void 촘촘한_경유점은_한_틱에_모두_처리하지_않고_다음_틱에_이어간다() {
        var match = playing();
        ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(0, 1.25));
        var path = (List<SkewerCoopMatch.Point>) ReflectionTestUtils.getField(match, "path");
        for (int index = 1; index <= 100; index++) {
            path.add(new SkewerCoopMatch.Point(index * .000002, 1.25));
        }
        path.add(new SkewerCoopMatch.Point(.5, 1.25));

        ReflectionTestUtils.invokeMethod(match, "move", .1);

        assertThat(match.privateView(101).at("/hall/position/x").asDouble()).isBetween(.000001, .001);
        assertThat(path).isNotEmpty();
        for (int tick = 0; tick < 30; tick++) {
            ReflectionTestUtils.invokeMethod(match, "move", .1);
        }
        assertThat(match.privateView(101).at("/hall/position/x").asDouble()).isEqualTo(.5);
        assertThat(path).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void 중복_경유점_정리도_한_틱의_처리_상한에_포함한다() {
        var match = playing();
        var start = new SkewerCoopMatch.Point(0, 1.25);
        ReflectionTestUtils.setField(match, "position", start);
        var path = (List<SkewerCoopMatch.Point>) ReflectionTestUtils.getField(match, "path");
        for (int index = 0; index < 100; index++) {
            path.add(start);
        }
        path.add(new SkewerCoopMatch.Point(.5, 1.25));

        ReflectionTestUtils.invokeMethod(match, "move", .1);

        assertThat(match.privateView(101).at("/hall/position/x").asDouble()).isZero();
        assertThat(path).hasSizeBetween(2, 100);
        for (int tick = 0; tick < 10; tick++) {
            ReflectionTestUtils.invokeMethod(match, "move", .1);
        }
        assertThat(match.privateView(101).at("/hall/position/x").asDouble()).isEqualTo(.5);
        assertThat(path).isEmpty();
    }

    @Test
    void 키보드_직선과_대각선_이동의_속도와_틱_상한을_유지한다() {
        for (var direction : List.of(new SkewerCoopMatch.Point(1, 0), new SkewerCoopMatch.Point(-1, 0),
                new SkewerCoopMatch.Point(0, 1), new SkewerCoopMatch.Point(0, -1),
                new SkewerCoopMatch.Point(1, 1))) {
            for (double seconds : new double[] {0, .016, .05, .1, .5}) {
                var match = playing();
                ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(0, 1.25));
                match.act(101, mapper.valueToTree(Map.of("type", "MOVE", "dx", direction.x(),
                        "dz", direction.z())), 3200);

                ReflectionTestUtils.invokeMethod(match, "move", seconds);

                var position = (SkewerCoopMatch.Point) ReflectionTestUtils.getField(match, "position");
                double distance = Math.min(.1, seconds) * 5.8;
                double length = Math.hypot(direction.x(), direction.z());
                assertThat(position.x()).isCloseTo(distance * direction.x() / length,
                        org.assertj.core.data.Offset.offset(.000001));
                assertThat(position.z()).isCloseTo(1.25 + distance * direction.z() / length,
                        org.assertj.core.data.Offset.offset(.000001));
            }
        }
    }

    @Test
    void PC도_PC랭킹_대상이지만_경기중_방식을_바꾸면_자격을_복구하지_않는다() {
        var match = playing();
        assertThat(match.publicView(101).path("rankingEligible").asBoolean()).isTrue();
        assertThat(match.publicView(101).path("rankingMode").asText()).isEqualTo("PC");
        match.act(202, mapper.valueToTree(Map.of("type", "CHEF_MODE", "vr", true)), 3200);
        match.act(202, mapper.valueToTree(Map.of("type", "CHEF_MODE", "vr", false)), 3200);
        assertThat(match.publicView(101).path("rankingEligible").asBoolean()).isFalse();
        assertThat(match.publicView(101).path("rankingMode").asText()).isEqualTo("PC");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 세척중_추가투입과_부분투입은_식기와_점수를_복제하지_않는다() {
        var match = playing();
        ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(-6.4, -4.25));
        var dirty = (List<SkewerCoopMatch.Dirty>) ReflectionTestUtils.getField(match, "dirty");
        dirty.add(new SkewerCoopMatch.Dirty(1, 1, 1));
        var interact = mapper.valueToTree(Map.of("type", "INTERACT"));
        match.act(101, interact, 3200);
        dirty.add(new SkewerCoopMatch.Dirty(2, 2, 1));
        dirty.add(new SkewerCoopMatch.Dirty(3, 3, 1));
        match.act(101, interact, 3200);

        assertThat(match.privateView(101).at("/hall/washer/load")).hasSize(2);
        assertThat(match.privateView(101).at("/hall/dirtyDishes")).hasSize(1);
        assertThat(match.publicView(101).path("score").asInt()).isEqualTo(6);
        assertThatThrownBy(() -> match.act(101, interact, 3200)).isInstanceOf(RuntimeException.class);
        assertThat(match.publicView(101).path("score").asInt()).isEqualTo(6);
    }

    @Test
    void 구_저널의_누락된_모드와_해시입력을_보존하고_PC_결과를_구분한다() throws Exception {
        var old = SkewerCoopSettlementServiceTests.result(200, true, "SKEWER_TIME_UP");
        var tree = mapper.valueToTree(old);
        ((com.fasterxml.jackson.databind.node.ObjectNode) tree).remove("playMode");
        var restored = mapper.treeToValue(tree, SkewerCoopFinished.class);
        assertThat(restored).isEqualTo(old);
        assertThat(restored.digestInput()).isEqualTo("SkewerCoopFinished[result=" + old.result()
                + ", teamScore=" + old.teamScore() + ", served=" + old.served() + ", chefUserId=" + old.chefUserId()
                + ", serverUserId=" + old.serverUserId() + ", rankingEligible=" + old.rankingEligible()
                + ", elapsedMillis=" + old.elapsedMillis() + ", durationMillis=" + old.durationMillis() + "]");
        var pc = new SkewerCoopFinished(old.result(), 200, 1, 101L, 202L, true, 240000, 240000, "PC");
        assertThat(pc.rankingMode()).isEqualTo("PC");
        assertThat(pc.rankingReason()).isEqualTo("ELIGIBLE");
    }
}
