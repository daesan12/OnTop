package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class RenewalMovingPadTests {
    @ParameterizedTest
    @ValueSource(strings = {"mole", "pigeon"})
    void 움직이는_발판에_착지한_후_함께_움직이고_다시_점프한다(String theme) throws Exception {
        var dir = Path.of("../frontend/generated/park-renewal");
        var map = PreparedParkMap.load(dir.resolve("server-map.json"), dir.resolve("manifest.json"), Set.of("channel-1"));
        var course = JumpCourse.loadEmbedded(map.jumpCourse(), map.metadata().mapVersion());
        var pad = course.colliders().stream().filter(p -> theme.equals(course.theme(p.block()))).findFirst().orElseThrow();
        var time = new AtomicLong(1_000_000_000L);
        try (var world = new WorldPhysics(map.createScene(), false, time::get, true, course)) {
            world.add("1");
            world.jumpmapRun("1", "test");
            world.place("1", pad.x(), pad.top() + 1.9, pad.z());
            for (int tick = 0; tick < 25 && world.observe("1").support().course() != pad; tick++) {
                step(world, time);
            }
            assertThat(world.observe("1").support().course()).isEqualTo(pad);
            double min = Double.MAX_VALUE;
            double max = -Double.MAX_VALUE;
            WorldPhysics.MovingPad ride = null;
            for (int tick = 0; tick < 115; tick++) {
                step(world, time);
                var observation = world.observe("1");
                assertThat(observation.support().course()).as("support at tick %d", tick).isEqualTo(pad);
                var movingPad = world.snapshot("1").motion().movingPad();
                assertThat(movingPad).as("rider at tick %d", tick).isNotNull();
                assertThat(movingPad.block()).isEqualTo(pad.block());
                assertThat(movingPad.dipStartedAt() != null).isEqualTo(theme.equals("mole"));
                if (ride == null) {
                    ride = movingPad;
                }
                assertThat(movingPad).isEqualTo(ride);
                min = Math.min(min, observation.feet());
                max = Math.max(max, observation.feet());
            }
            assertThat(max - min).isGreaterThan(.15);
            double worldHeightBeforeJump = world.snapshot("1").y();
            for (int tick = 1; tick <= 8; tick++) {
                world.input("1", new MoveInput(tick, .5, 0, false, tick == 1), time.get());
                step(world, time);
                world.observe("1");
            }
            var airborne = world.snapshot("1");
            assertThat(airborne.motion().movingPad()).isNull();
            assertThat(airborne.y()).isGreaterThan(worldHeightBeforeJump + .25);
            assertThat(airborne.x()).isGreaterThan(pad.x() + .25);
            assertThat(world.observe("1").support().course()).isNotEqualTo(pad);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"mole", "pigeon"})
    void 발판_테두리에_걸쳐_착지해도_발판과_함께_움직인다(String theme) throws Exception {
        var dir = Path.of("../frontend/generated/park-renewal");
        var map = PreparedParkMap.load(dir.resolve("server-map.json"), dir.resolve("manifest.json"), Set.of("channel-1"));
        var course = JumpCourse.loadEmbedded(map.jumpCourse(), map.metadata().mapVersion());
        var pad = course.colliders().stream().filter(p -> theme.equals(course.theme(p.block()))).findFirst().orElseThrow();
        var time = new AtomicLong(1_000_000_000L);
        try (var world = new WorldPhysics(map.createScene(), false, time::get, true, course)) {
            world.add("1");
            world.jumpmapRun("1", "test");
            world.place("1", pad.x() + pad.halfX() + .12, pad.top() + 1.9, pad.z());
            for (int tick = 0; tick < 25 && world.observe("1").support().course() != pad; tick++) {
                step(world, time);
            }
            assertThat(world.observe("1").support().course()).isEqualTo(pad);
            double lowest = Double.POSITIVE_INFINITY;
            double highest = Double.NEGATIVE_INFINITY;
            for (int tick = 0; tick < 115; tick++) {
                step(world, time);
                var observation = world.observe("1");
                assertThat(observation.support().course()).as("edge tick %d", tick).isEqualTo(pad);
                lowest = Math.min(lowest, observation.feet());
                highest = Math.max(highest, observation.feet());
            }
            assertThat(highest - lowest).isGreaterThan(.3);
            double startX = world.snapshot("1").x();
            double startY = world.snapshot("1").y();
            world.input("1", new MoveInput(1, 1, 0, false, true), time.get());
            for (int tick = 0; tick < 7; tick++) {
                step(world, time);
                world.observe("1");
            }
            assertThat(world.snapshot("1").x()).isGreaterThan(startX + .2);
            assertThat(world.snapshot("1").y()).isGreaterThan(startY + .25);
            assertThat(world.observe("1").support().course()).isNotEqualTo(pad);
        }
    }

    private static void step(WorldPhysics world, AtomicLong time) {
        world.step(time.addAndGet(WorldPhysics.STEP_NANOS), Set.of());
    }

    @ParameterizedTest
    @ValueSource(strings = {"mole", "pigeon"})
    void 다른_플레이어가_있어도_상승_중인_발판에서_바로_점프한다(String theme) throws Exception {
        var dir = Path.of("../frontend/generated/park-renewal");
        var map = PreparedParkMap.load(dir.resolve("server-map.json"), dir.resolve("manifest.json"), Set.of("channel-1"));
        var course = JumpCourse.loadEmbedded(map.jumpCourse(), map.metadata().mapVersion());
        var pad = course.colliders().stream().filter(p -> theme.equals(course.theme(p.block()))).findFirst().orElseThrow();
        var time = new AtomicLong(1_000_000_000L);
        try (var world = new WorldPhysics(map.createScene(), false, time::get, true, course)) {
            world.add("1");
            world.add("2");
            world.jumpmapRun("1", "test");
            world.place("1", pad.x(), pad.top() + 1.9, pad.z());
            for (int tick = 0; tick < 25 && world.observe("1").support().course() != pad; tick++) {
                step(world, time);
            }
            assertThat(world.observe("1").support().course()).isEqualTo(pad);
            boolean rising = false;
            for (int tick = 0; tick < 115 && !rising; tick++) {
                double previousY = world.snapshot("1").y();
                step(world, time);
                assertThat(world.observe("1").support().course()).isEqualTo(pad);
                rising = world.snapshot("1").y() - previousY > .01;
            }
            assertThat(rising).isTrue();
            var before = world.snapshot("1");

            world.input("1", new MoveInput(1, 1, 0, false, true), time.get());
            step(world, time);

            var after = world.snapshot("1");
            assertThat(after.y()).isGreaterThan(before.y() + .1);
            assertThat(after.x()).isGreaterThan(before.x());
            assertThat(after.motion().grounded()).isFalse();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"mole", "pigeon"})
    void 발판으로_이동_권한이_넘어갈_때_도착한_점프_입력을_한_번_처리한다(String theme) throws Exception {
        var dir = Path.of("../frontend/generated/park-renewal");
        var map = PreparedParkMap.load(dir.resolve("server-map.json"), dir.resolve("manifest.json"), Set.of("channel-1"));
        var course = JumpCourse.loadEmbedded(map.jumpCourse(), map.metadata().mapVersion());
        var pad = course.colliders().stream().filter(p -> theme.equals(course.theme(p.block()))).findFirst().orElseThrow();
        var time = new AtomicLong(1_000_000_000L);
        try (var world = new WorldPhysics(map.createScene(), true, time::get, true, course)) {
            world.add("1");
            world.jumpmapRun("1", "test");
            // Find the current surface from above since the pigeon's pose follows the server clock.
            for (double y = pad.top() + 1.22; y >= pad.top() + .3; y -= .03) {
                world.place("1", pad.x(), y, pad.z());
                if (world.support("1").course() == pad) break;
            }
            assertThat(world.observe("1").support().course()).isEqualTo(pad);
            var before = world.snapshot("1");
            assertThat(before.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            step(world, time);
            var handoff = world.snapshot("1");
            assertThat(handoff.motion().epoch()).isGreaterThan(before.motion().epoch());
            assertThat(handoff.motion().authority()).isNotEqualTo("CLIENT_VALIDATED");
            var ignoredPose = new ClientPositionValidator.Pose(handoff.x() + 10, handoff.y(), handoff.z());
            var jump = new ClientPositionValidator.Candidate(1, before.motion().epoch(), ignoredPose, false, true);
            var received = world.report("1", jump, time.get());
            assertThat(received.lastInputSeq()).isEqualTo(1);
            assertThat(received.x()).isEqualTo(handoff.x());
            var repeated = new ClientPositionValidator.Candidate(2, before.motion().epoch(), ignoredPose, false, true);
            assertThat(world.report("1", repeated, time.get()).lastInputSeq()).isEqualTo(1);
            for (int tick = 0; tick < 8; tick++) {
                step(world, time);
                world.observe("1");
            }
            assertThat(world.snapshot("1").y()).isGreaterThan(handoff.y() + .25);
        }
    }
}
