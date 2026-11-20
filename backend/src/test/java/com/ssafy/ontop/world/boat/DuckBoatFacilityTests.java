package com.ssafy.ontop.world.boat;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import com.ssafy.ontop.world.service.WorldFacilityService;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.data.Offset.offset;

/** 실제 220m 공원 생성물의 오리배 선착장·경로로 이용권 흐름을 검사한다. */
class DuckBoatFacilityTests {
    private static PreparedParkMap map;
    private final MutableClock clock = new MutableClock();

    @BeforeAll
    static void load() throws Exception {
        var directory = Path.of("..", "frontend", "generated", "park-renewal");
        map = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("channel-1"));
    }

    private WorldFacilityService service() {
        return new WorldFacilityService(map.facilities(), clock, System::nanoTime, map.boatRoute(), map.sleighRoute());
    }

    private Position atDock() {
        var center = map.facilities().facilities().stream().filter(d -> d.kind().equals("BOAT")).findFirst()
                .orElseThrow().center();
        return new Position(0, center.x(), center.y(), center.z(), 0);
    }

    @Test
    void 선착장은_두_팀의_대기_네_자리와_배_네_척의_좌석을_가진다() {
        var dock = service().definition("duck-boat");
        var route = map.boatRoute();

        assertThat(dock.kind()).isEqualTo("BOAT");
        assertThat(dock.seats()).hasSize(12);
        assertThat(route.lapMillis()).isEqualTo(60_000);
        assertThat(route.laneMillis()).isPositive().isLessThan(10_000);
    }

    @Test
    void 경로는_선착장_앞에서_출발해_섬을_돌고_같은_자리로_돌아온다() {
        var route = map.boatRoute();
        var start = route.seatPose(0, 0);
        var half = route.seatPose(30, 0);
        // 돌아올 때는 뱃머리가 반대라 좌우 좌석이 바뀐다. 두 좌석의 가운데로 배 위치를 비교한다.
        double startX = (start.x() + route.seatPose(0, 1).x()) / 2, endX = (route.seatPose(60, 0).x() + route.seatPose(60, 1).x()) / 2;

        assertThat(Math.hypot(start.x() - 59, start.z() - 9.6)).isLessThan(1);
        assertThat(startX).isCloseTo(59, offset(.15));
        assertThat(endX).isCloseTo(59, offset(.15));
        // 반 바퀴 지점은 섬 건너편(북쪽)이다.
        assertThat(half.z()).isLessThan(-30);
        // 출발할 때는 호수 쪽(-Z)을, 돌아올 때는 선착장 쪽(+Z)을 본다.
        assertThat(Math.cos(start.yaw())).isLessThan(-.9);
        assertThat(Math.cos(route.seatPose(59.9, 0).yaw())).isGreaterThan(.9);
    }

    @Test
    void 팀의_첫_대기_자리로만_들어오고_출발하면_배_좌석으로_옮겨_앉는다() {
        var facilities = service();
        for (int seat : new int[] {1, 3, 4}) {
            assertThatThrownBy(() -> facilities.use("a", "channel-1", "r" + seat, "duck-boat", seat, atDock()))
                    .isInstanceOf(WorldFacilityService.FacilityException.class)
                    .extracting(e -> ((WorldFacilityService.FacilityException) e).code()).isEqualTo("FACILITY_SEAT_INVALID");
        }

        var lease = facilities.use("a", "channel-1", "r1", "duck-boat", 0, atDock(), "b");
        assertThat(lease.seatIndex()).isZero();
        assertThat(facilities.freeBoatSeat("channel-1")).isEqualTo(2);
        assertThat(facilities.pendingBoatPartner("a")).isEqualTo("b");
        assertThat(facilities.boatInvitersOf("b")).containsExactly("a");
        var team = facilities.state("channel-1").boats().teams().get(0);
        assertThat(team.phase()).isEqualTo(DuckBoatSchedule.Phase.INVITING);
        assertThat(team.deadline()).isEqualTo(clock.at + 15_000);

        // 초대받은 사람은 멀리 있어도 초대한 사람 옆 대기 자리로 온다.
        var far = new Position(0, -60, 5, 60, 0);
        var partner = facilities.acceptBoat("b", "a", far);
        assertThat(partner.seatIndex()).isEqualTo(1);
        assertThat(partner.pose()).isEqualTo(facilities.definition("duck-boat").seats().get(1));
        assertThat(facilities.state("channel-1").boats().teams().get(0).departAt()).isEqualTo(clock.at - 0);

        var events = facilities.advanceBoats();

        assertThat(events.departures()).hasSize(1);
        assertThat(facilities.current("a").seatIndex()).isEqualTo(4);
        assertThat(facilities.current("b").seatIndex()).isEqualTo(5);
        assertThat(facilities.current("a").leaseId()).isEqualTo(lease.leaseId());
        assertThat(facilities.state("channel-1").boats().trips()).hasSize(1);
        assertThat(facilities.boatSailing("channel-1")).isTrue();
        assertThat(facilities.boatPose("a")).isEqualTo(map.boatRoute().seatPose(0, 0));
        clock.at += 30_000;
        assertThat(facilities.boatPose("b")).isEqualTo(map.boatRoute().seatPose(30, 1));
    }

    @Test
    void 끝난_초대는_수락할_수_없고_거절하면_혼자_타거나_다시_초대한다() {
        var facilities = service();
        facilities.use("a", "channel-1", "r1", "duck-boat", 0, atDock(), "b");
        assertThat(facilities.declineBoat("b", "a")).isTrue();
        assertThatThrownBy(() -> facilities.acceptBoat("b", "a", atDock()))
                .extracting(e -> ((WorldFacilityService.FacilityException) e).code()).isEqualTo("BOAT_INVITE_CLOSED");

        facilities.reinviteBoat("a", "c");
        assertThat(facilities.pendingBoatPartner("a")).isEqualTo("c");
        facilities.soloBoat("a");
        assertThatThrownBy(() -> facilities.soloBoat("a"))
                .extracting(e -> ((WorldFacilityService.FacilityException) e).code()).isEqualTo("BOAT_TEAM_INVALID");
        assertThat(facilities.advanceBoats().departures()).hasSize(1);
    }

    @Test
    void 대기는_두_팀까지이고_출발한_뒤에는_다시_받으며_내린_사람만_빠진다() {
        var facilities = service();
        facilities.use("a", "channel-1", "r1", "duck-boat", 0, atDock(), "b");
        facilities.acceptBoat("b", "a", atDock());
        facilities.use("c", "channel-1", "r2", "duck-boat", 2, atDock());
        assertThat(facilities.freeBoatSeat("channel-1")).isEqualTo(-1);

        facilities.advanceBoats();
        assertThat(facilities.freeBoatSeat("channel-1")).isZero();
        assertThat(facilities.release("a")).isNotNull();
        assertThat(facilities.boatPose("b")).isNotNull();
        assertThat(facilities.boatSailing("channel-1")).isTrue();
        facilities.release("b");
        assertThat(facilities.boatSailing("channel-1")).isFalse();
        // 뒤 팀은 직전 출발 10초 뒤에 출발한다.
        assertThat(facilities.current("c").seatIndex()).isEqualTo(2);
        clock.at += 10_000;
        assertThat(facilities.advanceBoats().departures()).hasSize(1);
    }

    @Test
    void 한_바퀴가_끝나면_도착_사건을_낸다() {
        var facilities = service();
        facilities.use("a", "channel-1", "r1", "duck-boat", 0, atDock());
        facilities.advanceBoats();
        clock.at += 60_000;

        var events = facilities.advanceBoats();

        assertThat(events.arrivals()).hasSize(1);
        assertThat(events.arrivals().get(0).riders()).containsExactly("a");
        assertThat(facilities.boatSailing("channel-1")).isFalse();
    }

    @Test
    void 대기_자리와_하차_위치는_선착장_바닥에_서고_탑승_중에는_수영으로_보지_않는다() {
        var nanos = new java.util.concurrent.atomic.AtomicLong(1_000_000_000L);
        var world = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("channel-1", "공원", 16))), Duration.ofMillis(1), nanos::get,
                map.createScene());
        try {
            world.join("a", "channel-1");
            var dock = service().definition("duck-boat");
            var water = new WorldFacilityService.Pose(62, 3.45, -10, 0);
            for (var spot : List.of(dock.seats().get(0), dock.seats().get(1), dock.seats().get(2), dock.seats().get(3), dock.exit())) {
                var lease = new WorldFacilityService.Lease("l", "channel-1", "a", "duck-boat", "BOAT", 0,
                        Instant.EPOCH, spot, spot, water, 0, 0, 0);
                assertThat(world.facilityExit("a", lease)).isEqualTo(spot);
            }
            world.holdFacility("a", map.boatRoute().seatPose(20, 0));
            assertThat(world.moveHeld("a", map.boatRoute().seatPose(30, 1))).isTrue();
            nanos.addAndGet(WorldPhysics.STEP_NANOS);
            world.advance(Set.of());
            var riding = world.positionOf("a");
            assertThat(riding.swimming()).isFalse();
            assertThat(riding.x()).isCloseTo(map.boatRoute().seatPose(30, 1).x(), offset(.01));
            world.setDuckBoatHidden("channel-1", true);
            world.setDuckBoatHidden("channel-1", false);
        } finally {
            world.clear();
        }
    }

    @Test
    void 오리배가_없는_맵은_시설_상태에_배_정보가_없다() {
        var plain = new WorldFacilityService();

        assertThat(plain.boatsEnabled()).isFalse();
        assertThat(plain.state("channel-1").boats()).isNull();
        assertThat(plain.advanceBoats().isEmpty()).isTrue();
    }

    private static final class MutableClock extends Clock {
        private long at = 1_800_000_000_000L;

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochMilli(at);
        }
    }
}
