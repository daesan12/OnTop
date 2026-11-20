package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.data.Offset.offset;

class SleighFacilityTests {
    private static PreparedParkMap map;
    private final MutableClock clock = new MutableClock();

    @BeforeAll
    static void load() throws Exception {
        var dir = Path.of("..", "frontend", "generated", "park-renewal");
        map = PreparedParkMap.load(dir.resolve("server-map.json"), dir.resolve("manifest.json"), Set.of("channel-1"));
    }

    private WorldFacilityService service() {
        return new WorldFacilityService(map.facilities(), clock, System::nanoTime, map.boatRoute(), map.sleighRoute());
    }

    @Test
    void 무료_썰매는_가까운_한명만_타고_재시도와_채널을_구분한다() {
        var service = service();
        var center = service.definition("winter-sleigh").center();
        var at = new Position(0, center.x(), center.y(), center.z(), 0);
        assertThatThrownBy(() -> service.use("far", "a", "far", "winter-sleigh", 0,
                new Position(0, 0, 0, 0, 0))).extracting("code").isEqualTo("FACILITY_OUT_OF_RANGE");
        var lease = service.use("one", "a", "request", "winter-sleigh", 0, at);
        assertThat(service.use("one", "a", "request", "winter-sleigh", 0, at)).isSameAs(lease);
        assertThatThrownBy(() -> service.use("two", "a", "second", "winter-sleigh", 0, at))
                .extracting("code").isEqualTo("FACILITY_OCCUPIED");
        assertThat(service.use("other", "b", "other", "winter-sleigh", 0, at).kind()).isEqualTo("SLEIGH");
        assertThatThrownBy(() -> service.aim("one", lease.leaseId(), 1, 1, 1))
                .extracting("code").isEqualTo("FACILITY_AIM_NOT_ALLOWED");
        service.disconnected("one");
        assertThat(service.state("a").occupancies()).isEmpty();
        assertThat(service.use("two", "a", "retry", "winter-sleigh", 0, at)).isNotNull();
    }

    @Test
    void 서버_시각으로_한바퀴_비행하고_실제_물리에서도_조종없이_안전하게_내린다() {
        var service = service();
        var d = service.definition("winter-sleigh");
        var lease = service.use("rider", "channel-1", "board", d.facilityId(), 0,
                new Position(0, d.center().x(), d.center().y(), d.center().z(), 0));
        try (var physics = new WorldPhysics(map.createScene())) {
            physics.add("rider");
            physics.hold("rider", lease.pose().x(), lease.pose().y(), lease.pose().z(), lease.pose().yaw());
            clock.at += 20_000;
            var flying = service.sleighPose(lease);
            assertThat(flying.y()).isGreaterThan(65);
            assertThat(service.sleighArrived(lease)).isFalse();
            physics.moveSeated("rider", flying.x(), flying.y(), flying.z(), flying.yaw());
            physics.input("rider", new MoveInput(1, 1, 1, true, true), 0);
            physics.step(WorldPhysics.STEP_NANOS, Set.of("rider"));
            assertThat(physics.snapshot("rider").x()).isCloseTo(flying.x(), offset(.001));
            assertThat(physics.snapshot("rider").y()).isCloseTo(flying.y(), offset(.001));
            assertThat(physics.snapshot("rider").moving()).isFalse();
            clock.at += 20_000;
            assertThat(service.sleighArrived(lease)).isTrue();
            assertThat(service.sleighPose(lease).y()).isCloseTo(lease.pose().y(), offset(.001));
            assertThat(physics.canStand(d.exit().x(), d.exit().y(), d.exit().z())).isTrue();
            physics.hold("rider", d.exit().x(), d.exit().y(), d.exit().z(), d.exit().yaw());
            service.release("rider");
            assertThat(service.sleighRiders()).isEmpty();
            physics.step(2 * WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("rider").z()).isCloseTo(d.exit().z(), offset(.01));
        }
    }

    private static final class MutableClock extends Clock {
        private long at = 1_800_000_000_000L;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(at); }
    }
}
