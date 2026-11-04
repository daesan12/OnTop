package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FollowJumpHandoffTests {
    @Test
    void 점프맵_활성_공원에서도_따라가기_해제_점프를_수동_이동에_인계한다() throws Exception {
        var now = new AtomicLong();
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        try (var physics = new WorldPhysics(scene, true, now::get, true, JumpCourse.loadDefault())) {
            physics.add("follower");
            physics.add("target");
            physics.place("follower", 0, .84, 36);
            physics.place("target", 8, .84, 36);
            physics.followMovement("follower");
            for (int i = 0; i < 12; i++) {
                now.addAndGet(WorldPhysics.STEP_NANOS);
                physics.step(now.get(), Set.of(), Map.of("follower", "target"));
            }
            assertThat(physics.input("follower", new MoveInput(1, 0, 0, false, true), now.get())).isTrue();
            now.addAndGet(WorldPhysics.STEP_NANOS);
            physics.step(now.get(), Set.of(), Map.of());
            var resumed = physics.snapshot("follower");
            assertThat(resumed.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(resumed.motion().velocityY()).isEqualTo(8);
            assertThat(resumed.motion().grounded()).isFalse();
            assertThat(resumed.lastInputSeq()).isEqualTo(1);
            // The acknowledged jump must not be consumed again after a repeated packet.
            assertThat(physics.input("follower", new MoveInput(1, 0, 0, false, true), now.get())).isFalse();
            now.addAndGet(100_000_000);
            var approved = physics.report("follower", new ClientPositionValidator.Candidate(2,
                    resumed.motion().epoch(), new ClientPositionValidator.Pose(resumed.x(),
                    resumed.y() + .65, resumed.z()), false, false), now.get());
            assertThat(approved.motion().correctionReason()).isNull();
            assertThat(approved.y()).isGreaterThan(resumed.y());
        }
    }

    @Test
    void 수동_종료가_대기중인_점프까지_취소한다() throws Exception {
        var now = new AtomicLong();
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        try (var physics = new WorldPhysics(scene, true, now::get, true, JumpCourse.loadDefault())) {
            physics.add("follower");
            physics.add("target");
            physics.place("follower", 0, .84, 36);
            physics.place("target", 8, .84, 36);
            physics.followMovement("follower");
            for (int i = 0; i < 12; i++) {
                now.addAndGet(WorldPhysics.STEP_NANOS);
                physics.step(now.get(), Set.of(), Map.of("follower", "target"));
            }
            physics.input("follower", new MoveInput(1, 0, 0, false, true), now.get());
            physics.stop("follower");
            now.addAndGet(WorldPhysics.STEP_NANOS);
            physics.step(now.get(), Set.of(), Map.of());
            var resumed = physics.snapshot("follower");
            assertThat(resumed.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(resumed.motion().velocityY()).isZero();
            assertThat(resumed.motion().grounded()).isTrue();
            assertThat(physics.hasMovementActivity("follower", now.get())).isFalse();
        }
    }
}
