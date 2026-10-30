package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.*;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class TunedContactReportTests {
    @Test void 개발서버_팔각정_접촉보고의_미세변동은_마지막승인좌표를_유지한다() throws Exception {
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            for (var shape : scene.shapes) {
                if (shape.id().matches(".+-chair-[23]")) continue;
                var body = new PhysicsRigidBody(shape.shape(), 0);
                body.setPhysicsLocation(shape.center()); body.setPhysicsRotation(shape.rotation());
                body.setCollisionGroup(2); body.setCollideWithGroups(1); space.addCollisionObject(body);
            }
            var from = new Pose(-2.5461666584014893, .8000130653381348, 14.842889785766602);
            var to = new Pose(-2.546180009841919, .8000194430351257, 14.842719078063965);
            var geometry = new PositionCollision(scene, space);
            assertThat(geometry.supported(from)).isTrue(); assertThat(geometry.supported(to)).isTrue();
            assertThat(geometry.clear(from, to, true)).isFalse();
            var now = new AtomicLong();
            var validator = new ClientPositionValidator(from, 1, 89, geometry, now::get, true);
            now.set(60_000_000);
            var result = validator.accept(new Candidate(1, 1, to, true, false));
            assertThat(result.accepted()).isTrue();
            assertThat(result.approved()).isEqualTo(from);
            assertThat(result.acceptedSeq()).isEqualTo(1);
            try (var world = new WorldPhysics(scene, true, now::get, true)) {
                world.add("contact"); world.place("contact", from.x(), from.y(), from.z());
                long epoch = world.snapshot("contact").motion().epoch();
                now.addAndGet(60_000_000);
                var state = world.report("contact", new Candidate(1, epoch, to, true, false), now.get());
                assertThat(state.motion().authority()).isEqualTo("CLIENT_VALIDATED");
                assertThat(state.motion().appliedInputSeq()).isEqualTo(1);
                assertThat(state.x()).isCloseTo(from.x(), within(.000001));
                assertThat(state.z()).isCloseTo(from.z(), within(.000001));
                now.addAndGet(60_000_000);
                var retreat = new Pose(from.x(), from.y(), from.z() + .02);
                state = world.report("contact", new Candidate(2, epoch, retreat, false, false), now.get());
                assertThat(state.motion().authority()).isEqualTo("CLIENT_VALIDATED");
                assertThat(state.z()).isCloseTo(retreat.z(), within(.000001));
            }
        } finally { space.destroy(); }
    }
}

class ContactHeldValidatorTests {
    private final java.util.concurrent.atomic.AtomicLong now = new java.util.concurrent.atomic.AtomicLong();
    private final ClientPositionValidator.Pose origin = new ClientPositionValidator.Pose(0, .8, 0);
    private final Gate gate = new Gate();
    private static final class Gate implements ClientPositionValidator.Geometry {
        boolean supported = true, clear = false;
        public boolean supported(ClientPositionValidator.Pose p) { return supported; }
        public boolean clear(ClientPositionValidator.Pose a, ClientPositionValidator.Pose b, boolean step) { return clear || a.equals(b); }
        public Double ceiling(ClientPositionValidator.Pose p, double rise) { return null; }
    }
    private ClientPositionValidator validator(boolean tuned) {
        return new ClientPositionValidator(origin, 1, 89, gate, now::get, tuned);
    }
    private ClientPositionValidator.Candidate report(long seq, double x, double y, boolean jump) {
        now.addAndGet(60_000_000);
        return new ClientPositionValidator.Candidate(seq, 1, new ClientPositionValidator.Pose(x, y, 0), true, jump);
    }
    @org.junit.jupiter.api.Test void 반복보고를_누적해도_승인위치가_벽으로_진입하지않는다() {
        var v = validator(true);
        for (int i=1;i<=1000;i++) {
            var result=v.accept(report(i,.0008,.8,false));
            org.assertj.core.api.Assertions.assertThat(result.accepted()).isTrue();
            org.assertj.core.api.Assertions.assertThat(result.reason()).isEqualTo("CONTACT_HELD");
            org.assertj.core.api.Assertions.assertThat(result.approved()).isEqualTo(origin);
            org.assertj.core.api.Assertions.assertThat(result.acceptedSeq()).isEqualTo(i);
        }
        org.assertj.core.api.Assertions.assertThat(v.accept(report(1001,.0011,.8,false)).reason()).isEqualTo("COLLISION");
    }
    @org.junit.jupiter.api.Test void 대각선거리_초과와_기본모드_점프_공중에는_적용하지않는다() {
        var v=validator(true);
        org.assertj.core.api.Assertions.assertThat(v.accept(report(1,.0008,.8008,false)).reason()).isEqualTo("COLLISION");
        org.assertj.core.api.Assertions.assertThat(v.accept(report(1,.0005,.8,true)).reason()).isEqualTo("COLLISION");
        gate.supported=false;
        org.assertj.core.api.Assertions.assertThat(v.accept(report(1,.0005,.8,false)).reason()).isEqualTo("COLLISION");
        gate.supported=true;
        var strict=validator(false);
        org.assertj.core.api.Assertions.assertThat(strict.accept(report(1,.0005,.8,false)).reason()).isEqualTo("COLLISION");
    }
    @org.junit.jupiter.api.Test void 진행중인_점프의_충돌은_흔들림으로_승인하지않는다() {
        var v=validator(true);gate.clear=true;
        org.assertj.core.api.Assertions.assertThat(v.accept(report(1,0,1.2,true)).accepted()).isTrue();
        gate.clear=false;
        org.assertj.core.api.Assertions.assertThat(v.accept(report(2,.0001,1.2001,false)).reason()).isEqualTo("COLLISION");
    }
}
