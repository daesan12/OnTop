package com.ssafy.ontop.world;

import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.time.Clock;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorldFacilityTests {
    private final WorldFacilityService catalog = new WorldFacilityService();

    @Test
    void 모든시설의_좌석은_독립적으로_예약되고_재시도는_새이용을_만들지_않는다() {
        for (var facility : catalog.catalog().facilities()) {
            for (int seat = 0; seat < facility.seats().size(); seat++) {
                var center = facility.center();
                var position = new Position(0, center.x(), center.y(), center.z(), center.yaw());
                var lease = catalog.use("user", "a", "request", facility.facilityId(), seat, position);
                long version = catalog.state("a").version();
                assertThat(catalog.use("user", "a", "request", facility.facilityId(), seat, position))
                        .isEqualTo(lease);
                assertThat(catalog.state("a").version()).isEqualTo(version);
                catalog.release("user");
                int selectedSeat = seat;
                assertThatThrownBy(() -> catalog.use("user", "a", "request", facility.facilityId(), selectedSeat,
                        position)).isInstanceOf(WorldFacilityService.FacilityException.class)
                        .extracting("code").isEqualTo("FACILITY_STALE_REQUEST");
                catalog.disconnected("user");
            }
        }
    }

    @Test
    void 망원경_순번과_100ms_경계는_서버시간으로_검사한다() {
        AtomicLong time = new AtomicLong();
        var service = new WorldFacilityService(catalog.catalog(), Clock.systemUTC(), time::get);
        var center = service.definition("telescope-1").center();
        var lease = service.use("user", "a", "request", "telescope-1", 0,
                new Position(0, center.x(), center.y(), center.z(), 0));
        service.aim("user", lease.leaseId(), 1, 0, 0);
        long version = service.state("a").version();
        service.aim("user", lease.leaseId(), 1, 1, 1);
        assertThat(service.state("a").version()).isEqualTo(version);
        time.set(99_999_999);
        assertThatThrownBy(() -> service.aim("user", lease.leaseId(), 2, 1, 1))
                .extracting("code").isEqualTo("FACILITY_AIM_TOO_FREQUENT");
        time.set(100_000_000);
        assertThat(service.aim("user", lease.leaseId(), 2, 1, 1).lastAimSeq()).isEqualTo(2);
    }

    @Test
    void 실제_물리_tick에서도_이용자세를_유지하고_하차하면_이전입력없이_이동한다() {
        try (var physics = new WorldPhysics()) {
            physics.add("user");
            physics.input("user", new com.ssafy.ontop.world.movement.MoveInput(1, 1, 0, true, true), 0);
            var pose = catalog.definition("bench-0").seats().getFirst();
            physics.hold("user", pose.x(), pose.y(), pose.z(), pose.yaw());
            for (int i = 1; i <= 30; i++) {
                physics.step(i * WorldPhysics.STEP_NANOS, Set.of("user"));
            }
            assertThat(physics.snapshot("user").x()).isEqualTo(pose.x(),
                    org.assertj.core.data.Offset.offset(.001));
            assertThat(physics.snapshot("user").moving()).isFalse();
            var exit = catalog.definition("bench-0").exit();
            assertThat(physics.canStand(exit.x(), exit.y(), exit.z())).isTrue();
            assertThat(physics.canStand(49.1, .8, 48.2)).isTrue();
            assertThat(physics.canStand(-9, 5, 36.25)).isFalse();
            assertThat(physics.canStand(-9, .8, 34.75)).isFalse();
            physics.hold("user", exit.x(), exit.y(), exit.z(), exit.yaw());
            for (int i = 31; i <= 40; i++) {
                physics.step(i * WorldPhysics.STEP_NANOS, Set.of());
            }
            assertThat(physics.snapshot("user").x()).isEqualTo(exit.x(),
                    org.assertj.core.data.Offset.offset(.001));
            assertThat(physics.snapshot("user").lastInputSeq()).isEqualTo(1);
            long now = 41 * WorldPhysics.STEP_NANOS;
            physics.input("user", new com.ssafy.ontop.world.movement.MoveInput(2, 1, 0, false, false), now);
            physics.step(now, Set.of());
            assertThat(physics.snapshot("user").moving()).isTrue();
            assertThat(physics.snapshot("user").x()).isGreaterThan(exit.x());
        }
    }
}
