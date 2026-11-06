package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.skewer.coop.domain.SkewerCoopMatch;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SkewerCoopFeedbackTests {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

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
    void 클릭_이동은_경유점을_지나도_남은_이동량을_사용한다() {
        var match = playing();
        ReflectionTestUtils.setField(match, "position", new SkewerCoopMatch.Point(-2.75, 1.25));
        match.act(101, mapper.valueToTree(Map.of("type", "NAVIGATE", "x", 2.25, "z", 1.25)), 3200);

        for (long time = 3300; time <= 3900; time += 100) {
            double before = match.privateView(101).at("/hall/position/x").asDouble();
            match.tick(time, user -> true);
            double after = match.privateView(101).at("/hall/position/x").asDouble();
            assertThat(after - before).isCloseTo(.5, org.assertj.core.data.Offset.offset(.000001));
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

        for (var destination : destinations) {
            match.act(101, mapper.valueToTree(Map.of("type", "NAVIGATE", "x", destination.x(),
                    "z", destination.z())), 3200);
            for (int tick = 0; tick < 300; tick++) {
                ReflectionTestUtils.invokeMethod(match, "move", .1);
                var position = (SkewerCoopMatch.Point) ReflectionTestUtils.getField(match, "position");
                assertThat((Boolean) ReflectionTestUtils.invokeMethod(match, "walkable", position)).isTrue();
            }
            var position = (SkewerCoopMatch.Point) ReflectionTestUtils.getField(match, "position");
            assertThat(Math.hypot(position.x() - destination.x(), position.z() - destination.z())).isLessThan(.000001);
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
