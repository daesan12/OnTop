package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static com.ssafy.ontop.world.movement.ClientPositionValidator.Candidate;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.Geometry;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.Pose;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.Sample;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PositionPathTests {
    private final AtomicLong now = new AtomicLong();
    private final Pose origin = new Pose(-1, .84, 0);
    private final Geometry ground = new Geometry() {
        public boolean supported(Pose pose) { return pose.y() <= .85; }
        public boolean clear(Pose from, Pose to, boolean step) { return true; }
        public Double ceiling(Pose from, double rise) { return null; }
    };

    private Candidate path(long sequence, Sample... samples) {
        return new Candidate(sequence, 1, samples[samples.length - 1].pose(), true, false, 0, true,
                List.of(samples));
    }

    private Sample point(double x, double y, boolean jump) { return new Sample(new Pose(x, y, 0), jump); }

    @Test
    void 보고_사이의_착지를_서버가_확인한_재점프만_새_높이기준을_얻는다() {
        var platforms = new Geometry() {
            public boolean supported(Pose pose) { return pose.y() <= .85 || Math.abs(pose.y() - 1.9) < .01; }
            public boolean clear(Pose from, Pose to, boolean step) { return true; }
            public Double ceiling(Pose from, double rise) { return null; }
        };
        for (boolean intermediate : List.of(false, true)) {
            now.set(0);
            var validator = new ClientPositionValidator(origin, 1, 79, platforms, now::get, true);
            now.set(60_000_000);
            assertThat(validator.accept(new Candidate(1, 1, new Pose(-1, 1.3, 0), true, true)).accepted()).isTrue();
            now.set(300_000_000);
            assertThat(validator.accept(new Candidate(2, 1, new Pose(-1, 1.99, 0), true, false)).accepted()).isTrue();
            now.set(400_000_000);

            var report = intermediate ? path(3, point(-1, 1.9, false), point(-1, 2.1, true), point(-1, 2.4, false))
                    : new Candidate(3, 1, new Pose(-1, 2.4, 0), true, true);
            var result = validator.accept(report);

            assertThat(result.accepted()).isEqualTo(intermediate);
            assertThat(result.reason()).isEqualTo(intermediate ? "ACCEPTED" : "JUMP_HEIGHT");
        }
    }

    @Test
    void 경로의_각_점에서_점프를_주장해도_공중_높이상한을_재충전하지못한다() {
        var validator = new ClientPositionValidator(origin, 1, 79, ground, now::get, true);
        now.set(300_000_000);

        var rejected = validator.accept(path(1, point(-1, 1.3, true), point(-1, 1.9, true), point(-1, 2.5, true)));

        assertThat(rejected.reason()).isEqualTo("JUMP_HEIGHT");
        assertThat(rejected.approved()).isEqualTo(origin);
        assertThat(rejected.acceptedSeq()).isZero();
        assertThat(validator.accept(path(1, point(-.9, .84, false))).accepted()).isTrue();
    }

    @Test
    void 왕복_경로와_반복보고는_끝점_거리나_중간점_수로_이동예산을_늘리지못한다() {
        var validator = new ClientPositionValidator(origin, 1, 79, ground, now::get, true);
        now.set(60_000_000);
        var samples = new ArrayList<Sample>();
        for (int index = 0; index < 20; index++) {
            samples.add(point(index % 2 == 0 ? -.8 : -1, .84, false));
        }

        var rejected = validator.accept(new Candidate(1, 1, origin, true, false, 0, true, samples));

        assertThat(rejected.reason()).isEqualTo("SPEED");
        assertThat(rejected.approved()).isEqualTo(origin);
        assertThat(validator.accept(path(1, point(0, .84, false))).accepted()).isTrue();
        assertThat(validator.accept(path(2, point(.6, .84, false))).reason()).isEqualTo("SPEED");
        assertThat(validator.accept(path(1, point(0, .84, false))).reason()).isEqualTo("SEQUENCE");
        var oldEpoch = new Candidate(2, 0, new Pose(.1, .84, 0), true, false, 0, true,
                List.of(point(.1, .84, false)));
        assertThat(validator.accept(oldEpoch).reason()).isEqualTo("EPOCH");
        validator.blocked(true);
        assertThat(validator.accept(path(2, point(.1, .84, false))).reason()).isEqualTo("ACTIVITY");
    }

    @Test
    void 높은_곳에서_낙하하는_경로는_같은_수신시각의_중간점도_검증한다() {
        var start = new Pose(-1, 38, 0);
        var validator = new ClientPositionValidator(start, 1, 79, ground, now::get, true);
        now.set(50_000_000);
        var result = validator.accept(path(1, point(-1, 37, false),
                point(-1, 35.9, false), point(-1, 34.7, false)));
        assertThat(result.reason()).isEqualTo("ACCEPTED");
        assertThat(result.approved().y()).isEqualTo(34.7);
    }

    @Test
    void 중간점으로_작게_나눈_낙하도_보고_전체의_수직_한도를_넘지못한다() {
        var validator = new ClientPositionValidator(origin, 1, 79, ground, now::get, true);
        now.set(60_000_000);
        var samples = new ArrayList<Sample>();
        for (int index = 1; index <= 40; index++) {
            samples.add(point(-1, .84 - index * .5, false));
        }

        var result = validator.accept(new Candidate(1, 1, samples.getLast().pose(), true, false, 0, true, samples));

        assertThat(result.reason()).isEqualTo("VERTICAL");
        assertThat(result.approved()).isEqualTo(origin);
    }

    @Test
    void 경로의_중간_벽관통과_반복_미세침투는_전체_보고를_원자적으로_거절한다() {
        var space = space();
        try {
            add(space, new Vector3f(0, 2, 0), new Vector3f(.1f, 2, 3));
            var geometry = new PositionCollision(ParkScene.load(), space);
            var validator = new ClientPositionValidator(origin, 1, 79, geometry, now::get, true);
            now.set(100_000_000);

            var crossed = validator.accept(path(1, point(-.6, .84, false), point(.5, .84, false)));

            assertThat(crossed.reason()).isEqualTo("COLLISION");
            assertThat(crossed.approved()).isEqualTo(origin);
            assertThat(validator.accept(path(1, point(-.405, .84, false))).accepted()).isTrue();
            now.set(200_000_000);
            var samples = new ArrayList<Sample>();
            for (int index = 1; index <= 30; index++) {
                samples.add(point(-.405 + index * .005, .84, false));
            }
            var partial = validator.accept(new Candidate(2, 1, samples.getLast().pose(), true, false, 0, true, samples));
            assertThat(partial.reason()).isEqualTo("COLLISION");
            assertThat(partial.approved().x()).isEqualTo(-.405);
            assertThat(partial.acceptedSeq()).isEqualTo(1);
        } finally {
            space.destroy();
        }
    }

    @Test
    void 중간점이_있어도_바닥과_천장을_뚫는_경로는_거절한다() {
        var space = space();
        try {
            add(space, new Vector3f(0, 1.9f, 0), new Vector3f(4, .1f, 4));
            var geometry = new PositionCollision(ParkScene.load(), space);
            var validator = new ClientPositionValidator(origin, 1, 79, geometry, now::get, true);
            now.set(100_000_000);

            assertThat(validator.accept(path(1, point(-1, .95, true), point(-1, 1.3, false))).reason()).isEqualTo("COLLISION");
            assertThat(validator.accept(path(1, point(-1, -1.4, false))).reason()).isEqualTo("COLLISION");
        } finally {
            space.destroy();
        }
    }

    @Test
    void 선택_경로는_개수와_좌표만_받고_클라이언트_접지나_시각은_받지않는다() throws Exception {
        var mapper = new ObjectMapper();
        var json = (ObjectNode) mapper.readTree("{\"seq\":1,\"epoch\":1,\"x\":-1,\"y\":0.84,\"z\":0,\"run\":true,\"jump\":false,\"yaw\":0}");
        assertThat(Candidate.parse(json).path()).isNull();
        var points = json.putArray("path");
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
        var point = points.addObject().put("x", -1).put("y", .84).put("z", 0).put("jump", false);
        assertThat(Candidate.parse(json).path()).hasSize(1);
        point.put("grounded", true);
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
        point.remove("grounded"); point.put("timestamp", 1000);
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
        point.remove("timestamp"); point.put("y", Double.NaN);
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
        point.put("y", .84);
        for (int index = 1; index <= 64; index++) {
            points.add(point.deepCopy());
        }
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
        var validator = new ClientPositionValidator(origin, 1, 79, ground, now::get, true);
        assertThat(validator.accept(new Candidate(1, 1, origin, true, false, 0, true,
                Collections.nCopies(65, point(-1, .84, false)))).reason()).isEqualTo("INVALID_PATH");
        assertThat(validator.accept(new Candidate(1, 1, origin, true, false, 0, true,
                List.of(point(-.9, .84, false)))).reason()).isEqualTo("INVALID_PATH");
    }

    private PhysicsSpace space() {
        ParkScene.load();
        var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        add(space, new Vector3f(0, -.25f, 0), new Vector3f(10, .25f, 10));
        return space;
    }

    private void add(PhysicsSpace space, Vector3f center, Vector3f half) {
        var body = new PhysicsRigidBody(new BoxCollisionShape(half), 0);
        body.setPhysicsLocation(center);
        body.setCollisionGroup(2);
        body.setCollideWithGroups(1);
        space.addCollisionObject(body);
    }
}
