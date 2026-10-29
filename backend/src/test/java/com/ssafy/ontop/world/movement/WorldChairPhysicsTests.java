package com.ssafy.ontop.world.movement;

import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class WorldChairPhysicsTests {
    @Test void 승인인원에따라_실제의자충돌이_2_3_4_2로전환된다() {
        try (var physics = new WorldPhysics(); var other = new WorldPhysics()) {
            assertThat(physics.canStand(-2.61, 2.9, 6)).isTrue();
            assertThat(physics.canStand(2.61, 2.9, 6)).isTrue();
            assertThat(physics.canStand(0, 2.9, 8.25)).isFalse();
            physics.chairCounts(Map.of("table-5", 3));
            assertThat(physics.canStand(-2.61, 2.9, 6)).isFalse();
            assertThat(physics.canStand(2.61, 2.9, 6)).isTrue();
            physics.chairCounts(Map.of("table-5", 4));
            assertThat(physics.canStand(2.61, 2.9, 6)).isFalse();
            assertThat(other.canStand(2.61, 2.9, 6)).as("다른 채널의 공간은 유지").isTrue();
            physics.chairCounts(Map.of("table-5", 2));
            assertThat(physics.canStand(-2.61, 2.9, 6)).isTrue();
            assertThat(physics.canStand(2.61, 2.9, 6)).isTrue();
            assertThat(physics.canStand(0, 2.9, 8.25)).isFalse();
            assertThat(physics.canStand(0, 2.9, 6)).as("탁자 충돌 유지").isFalse();
        }
    }

    @Test void 의자생성영역의_산책자는_가까운안전위치로옮기고_착석자는유지한다() {
        try (var physics = new WorldPhysics()) {
            physics.add("walker"); physics.add("seated");
            physics.place("walker", 2.61, 2.9, 6);
            physics.hold("seated", -2.61, 3.1, 6, 0);
            var seated = physics.snapshot("seated");
            physics.chairCounts(Map.of("table-5", 4));
            var moved = physics.snapshot("walker");
            assertThat(physics.canStand(moved.x(), moved.y(), moved.z())).isTrue();
            assertThat(Math.hypot(moved.x() - 2.61, moved.z() - 6)).isBetween(.1, 4.0);
            assertThat(physics.lastRecovery("walker").reason()).isEqualTo("CHAIR_ACTIVATED");
            assertThat(physics.snapshot("seated")).isEqualTo(seated);
            physics.chairCounts(Map.of("table-5", 4));
            assertThat(physics.snapshot("walker")).as("동일 설정으로 재이동하지 않음").isEqualTo(moved);
        }
    }

    @Test void 숨긴의자자리로실제걷고_표시된의자는통과하지못한다() {
        try (var open = new WorldPhysics(); var closed = new WorldPhysics()) {
            closed.chairCounts(Map.of("table-5", 4));
            for (var physics : new WorldPhysics[]{open, closed}) {
                physics.add("a"); physics.place("a", 5, 2.9, 6);
                for (int tick = 1; tick <= 22; tick++) {
                    long now = tick * WorldPhysics.STEP_NANOS;
                    physics.input("a", new MoveInput(tick, -1, 0, false, false), now);
                    physics.step(now, Set.of());
                }
            }
            assertThat(open.snapshot("a").x()).isLessThan(2.5);
            assertThat(closed.snapshot("a").x()).isGreaterThan(3.4);
        }
    }
}
