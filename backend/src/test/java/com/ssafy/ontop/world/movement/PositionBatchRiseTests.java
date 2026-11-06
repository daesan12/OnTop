package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static com.ssafy.ontop.world.movement.ClientPositionValidator.Candidate;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.Geometry;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.Pose;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.Sample;
import static org.assertj.core.api.Assertions.assertThat;

class PositionBatchRiseTests {
    private final Geometry platform = new Geometry() {
        public boolean supported(Pose p) { return p.x() >= 0 && Math.abs(p.y() - 1.9) < .01; }
        public boolean clear(Pose from, Pose to, boolean step) { return true; }
        public Double ceiling(Pose from, double rise) { return null; }
        public double jumpSpeed(Pose from, boolean tuned) { return from.x() >= 0 ? 8.6 : 8; }
    };
    private final Pose airborne = new Pose(-.1, 1.9, 0);
    private final List<Sample> path = List.of(new Sample(new Pose(0, 1.9, 0), false),
            new Sample(new Pose(0, 2.05, 0), true), new Sample(new Pose(0, 2.3, 0), false),
            new Sample(new Pose(0, 2.66, 0), false));

    @Test
    void 정상_60ms_간격에는_공중시작_중간착지_상승을_승인한다() {
        var clock = new AtomicLong();
        var validator = new ClientPositionValidator(airborne, 1, 79, platform, clock::get, true);
        clock.set(60_000_000);
        var result = validator.accept(new Candidate(1, 1, path.getLast().pose(), true, false, 0, true, path));
        assertThat(result.accepted()).isTrue();
    }

    @Test
    void 수신간격이_1ms로_압축돼도_중간착지_이후의_실제_점프속도로_승인한다() {
        var clock = new AtomicLong();
        var batch = new ClientPositionValidator(airborne, 1, 79, platform, clock::get, true);
        var individual = new ClientPositionValidator(airborne, 1, 79, platform, clock::get, true);
        clock.set(1_000_000);
        long seq = 0;
        for (var sample : path) {
            assertThat(individual.accept(new Candidate(++seq, 1, sample.pose(), true, sample.jump())).accepted())
                    .as("same-clock sample %s", seq).isTrue();
        }
        var result = batch.accept(new Candidate(1, 1, path.getLast().pose(), true, false, 0, true, path));
        assertThat(result.accepted()).isTrue();
        assertThat(result.approved()).isEqualTo(path.getLast().pose());
    }

    @Test
    void 실제_얇은발판의_중간착지도_수신간격이_압축되면_새_점프높이로_승인한다() {
        var scene = ParkScene.load();
        var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            var rail = new PhysicsRigidBody(new BoxCollisionShape(new Vector3f(.05f, .55f, 3)), 0);
            rail.setPhysicsLocation(new Vector3f(0, .55f, 0));
            rail.setCollisionGroup(2); rail.setCollideWithGroups(1); space.addCollisionObject(rail);
            var geometry = new PositionCollision(scene, space);
            var start = new Pose(-.5, 1.94, 0);
            var landed = new Pose(0, 1.94, 0);
            assertThat(geometry.supported(start)).isFalse();
            assertThat(geometry.supported(landed)).isTrue();
            var samples = List.of(new Sample(landed, false), new Sample(new Pose(0, 2.07, 0), true),
                    new Sample(new Pose(0, 2.27, 0), false), new Sample(new Pose(0, 2.65, 0), false));
            var clock = new AtomicLong();
            var batch = new ClientPositionValidator(start, 1, 79, geometry, clock::get, true);
            var individual = new ClientPositionValidator(start, 1, 79, geometry, clock::get, true);
            clock.set(1_000_000);
            long seq = 0;
            for (var sample : samples) {
                assertThat(individual.accept(new Candidate(++seq, 1, sample.pose(), true, sample.jump())).accepted())
                        .as("actual geometry sample %s", seq).isTrue();
            }
            assertThat(batch.accept(new Candidate(1, 1, samples.getLast().pose(), true, false, 0, true, samples))
                    .accepted()).isTrue();
        } finally {
            space.destroy();
        }
    }

    @Test
    void 착지점에서_발동한_점프도_검증된_목적지_지지를_기준으로_승인한다() {
        var clock = new AtomicLong();
        var validator = new ClientPositionValidator(airborne, 1, 79, platform, clock::get, true);
        var samples = List.of(new Sample(new Pose(0, 1.9, 0), true),
                new Sample(new Pose(0, 2.3, 0), false), new Sample(new Pose(0, 2.66, 0), false));
        clock.set(1_000_000);

        var result = validator.accept(new Candidate(1, 1, samples.getLast().pose(), true, false, 0, true, samples));

        assertThat(result.accepted()).isTrue();
    }

    @Test
    void 공중_점프표식은_전체_상승한도를_늘리지못하며_거절후_예산과_비행상태를_복구한다() {
        var ground = new Geometry() {
            public boolean supported(Pose p) { return p.y() <= .85; }
            public boolean clear(Pose from, Pose to, boolean step) { return true; }
            public Double ceiling(Pose from, double rise) { return null; }
        };
        var clock = new AtomicLong();
        var initial = new Pose(-.1, .84, 0);
        var validator = new ClientPositionValidator(initial, 1, 79, ground, clock::get, true);
        var control = new ClientPositionValidator(initial, 1, 79, ground, clock::get, true);
        clock.set(60_000_000);
        var firstJump = new Candidate(1, 1, new Pose(-.1, 1.3, 0), true, true);
        assertThat(validator.accept(firstJump).accepted()).isTrue();
        assertThat(control.accept(firstJump).accepted()).isTrue();
        clock.set(61_000_000);
        var samples = List.of(new Sample(new Pose(.2, 1.6, 0), true),
                new Sample(new Pose(.5, 1.9, 0), true), new Sample(new Pose(.2, 2.2, 0), true));

        var result = validator.accept(new Candidate(2, 1, samples.getLast().pose(), true, true, 0, true, samples));

        assertThat(result.reason()).isEqualTo("VERTICAL");
        assertThat(result.approved()).isEqualTo(firstJump.pose());
        assertThat(result.acceptedSeq()).isEqualTo(1);
        var retry = new Candidate(2, 1, new Pose(1.1, 1.3, 0), true, false, 0, true,
                List.of(new Sample(new Pose(1.1, 1.3, 0), false)));
        var expected = control.accept(retry);
        assertThat(expected.accepted()).isTrue();
        assertThat(validator.accept(retry)).isEqualTo(expected);
        assertThat(validator.accept(new Candidate(3, 1, new Pose(1.1, 2.31, 0), true, true)).accepted())
                .isFalse();
    }

    @Test
    void 중간_착지로_상한을_얻어도_이후_충돌과_점프높이_초과는_전체를_거절한다() {
        for (boolean collision : List.of(false, true)) {
            var gate = new Geometry() {
                public boolean supported(Pose p) { return platform.supported(p); }
                public boolean clear(Pose from, Pose to, boolean step) {
                    return from.equals(to) || !collision || to.y() < 2.5;
                }
                public Double ceiling(Pose from, double rise) { return null; }
            };
            var clock = new AtomicLong();
            var validator = new ClientPositionValidator(airborne, 1, 79, gate, clock::get, true);
            var samples = collision ? path : List.of(path.get(0), path.get(1), path.get(2),
                    new Sample(new Pose(0, 2.7, 0), false), new Sample(new Pose(0, 3.1, 0), false),
                    new Sample(new Pose(0, 3.5, 0), false));
            clock.set(1_000_000);

            var result = validator.accept(new Candidate(1, 1, samples.getLast().pose(), true, false, 0, true, samples));

            assertThat(result.reason()).isEqualTo(collision ? "COLLISION" : "JUMP_HEIGHT");
            assertThat(result.approved()).isEqualTo(airborne);
            assertThat(result.acceptedSeq()).isZero();
            var retry = new Candidate(1, 1, path.get(2).pose(), true, false, 0, true, path.subList(0, 3));
            assertThat(validator.accept(retry).accepted()).isTrue();
        }
    }
}
