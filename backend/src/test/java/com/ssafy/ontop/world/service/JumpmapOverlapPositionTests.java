package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapActivation;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.ClientPositionValidator;
import com.ssafy.ontop.world.movement.WorldPhysics;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class JumpmapOverlapPositionTests {
    @Test
    void 같은_발판에_겹친_두_플레이어의_이동과_방송이_각각_갱신된다() throws Exception {
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        var course = JumpCourse.loadDefault();
        var pad = course.colliders().getFirst();
        var clock = new AtomicLong(1_000_000_000L);
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("channel-1", "공원", 20))), Duration.ofMillis(1), clock::get, scene);
        var environment = new MockEnvironment();
        environment.setActiveProfiles("dev");
        registry.configurePositionReports(true, environment);
        registry.configureTunedMovement(true, environment);
        registry.configureJumpCourse(JumpmapActivation.decide(true, scene.version(), () -> course));
        for (String user : List.of("7", "8")) {
            registry.join(user, "channel-1");
            registry.releaseFacility(user, new WorldFacilityService.Pose(pad.x(), pad.top() + .8, pad.z(), 0));
        }
        // 시설 강제 배치가 해제된 다음 틱에 수동 위치 보고 모드로 돌아온다.
        for (int index = 0; index < 2; index++) {
            clock.addAndGet(WorldPhysics.STEP_NANOS);
            registry.advance(Set.of());
        }
        int broadcasts = 0;
        for (int frame = 1; frame <= 30; frame++) {
            clock.addAndGet(WorldPhysics.STEP_NANOS);
            for (String user : List.of("7", "8")) {
                var avatar = registry.worldState("channel-1").avatars().stream()
                        .filter(value -> value.userId().equals(user)).findFirst().orElseThrow();
                double direction = user.equals("7") ? 1 : -1;
                double x = pad.x() + direction * frame * .01;
                registry.reportPosition(user, new ClientPositionValidator.Candidate(frame, avatar.motion().epoch(),
                        new ClientPositionValidator.Pose(x, pad.top() + .8, pad.z()), false, false));
                var approved = registry.positionOf(user);
                assertThat(approved.x()).as("user=%s frame=%s", user, frame).isCloseTo(x, within(.0001));
                assertThat(approved.lastInputSeq()).isEqualTo(frame);
            }
            var patches = registry.advance(Set.of());
            if (!patches.isEmpty()) {
                broadcasts++;
                long expectedSequence = frame;
                assertThat(patches.getFirst().avatars()).hasSize(2).allSatisfy(avatar ->
                        assertThat(avatar.position().lastInputSeq()).isEqualTo(expectedSequence));
            }
        }
        assertThat(broadcasts).isGreaterThanOrEqualTo(6);
    }
}
