package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.*;

class ClientPositionValidatorTests {
    private long now;
    private Candidate request(long seq, double x, double y, boolean run, boolean jump) { return new Candidate(seq, 1, new Pose(x, y, 0), run, jump); }
    private ClientPositionValidator validator(TestGeometry geometry) { return new ClientPositionValidator(new Pose(0, .8, 0), 1, 79, geometry, () -> now); }

    @Test void 서버시계_예산과_순번_세대_신선도로_좌표조작을_차단한다() {
        try (var geometry = new TestGeometry(flat(false))) {
            var validator = validator(geometry);
            now = 100_000_000;
            assertThat(validator.accept(request(1, .9, .8, true, false)).accepted()).isTrue();
            var duplicate = validator.accept(request(1, 5, .8, true, false));
            assertThat(duplicate.reason()).isEqualTo("SEQUENCE");
            assertThat(duplicate.approved().x()).isEqualTo(.9);
            assertThat(validator.accept(new Candidate(2, 0, new Pose(1, .8, 0), true, false)).reason()).isEqualTo("EPOCH");
            assertThat(validator.accept(request(2, 40, .8, true, false)).reason()).isEqualTo("SPEED");
            assertThat(validator.accept(request(2, 999, .8, true, false)).reason()).isEqualTo("BOUNDS");
            assertThat(validator.accept(request(2, Double.NaN, .8, true, false)).reason()).isEqualTo("INVALID");
            now = 10_000_000_000L;
            assertThat(validator.accept(request(2, 50, .8, true, false)).reason()).isEqualTo("STALE");
            validator.relocate(new Pose(0, .8, 0), 2);
            assertThat(validator.accept(new Candidate(1, 1, new Pose(0, .8, 0), false, false)).reason()).isEqualTo("EPOCH");
            validator.blocked(true);
            assertThat(validator.accept(new Candidate(1, 2, new Pose(.1, .8, 0), false, false)).reason()).isEqualTo("ACTIVITY");
        }
    }
    @Test void 동일서버시각의_연속요청도_추가이동예산을_생성하지않는다() {
        try (var geometry = new TestGeometry(flat(false))) {
            var validator = validator(geometry);
            assertThat(validator.accept(request(1, .45, .8, true, false)).accepted()).isTrue();
            assertThat(validator.accept(request(2, .9, .8, true, false)).accepted()).isTrue();
            assertThat(validator.accept(request(3, 2.7, .8, true, false)).reason()).isEqualTo("SPEED");
        }
    }
    @Test void 정상달리기가_250ms_몰려도_서버경과시간_예산으로_승인한다() {
        try (var geometry = new TestGeometry(flat(false))) {
            var validator = validator(geometry);
            now = 100_000_000;
            assertThat(validator.accept(request(1, .9, .8, true, false)).accepted()).isTrue();
            now = 350_000_000;
            assertThat(validator.accept(request(2, 3.15, .8, true, false)).accepted()).isTrue();
            // Reports can spend only the bounded budget, not add simulated time.
            assertThat(validator.accept(request(3, 8, .8, true, false)).reason()).isEqualTo("SPEED");
        }
    }
    @Test void 한검증기의_동시요청은_동일한_이동예산을_이중사용하지않는다() throws Exception {
        var geometry = new Geometry() {
            public boolean supported(Pose p) { return true; }
            public boolean clear(Pose from, Pose to, boolean step) { return true; }
            public Double ceiling(Pose from, double rise) { return null; }
        };
        var validator = new ClientPositionValidator(new Pose(0, .8, 0), 1, 79, geometry, () -> 0);
        var ready = new java.util.concurrent.CountDownLatch(2); var start = new java.util.concurrent.CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> { ready.countDown(); start.await(); return validator.accept(request(1, .9, .8, true, false)); });
            var second = executor.submit(() -> { ready.countDown(); start.await(); return validator.accept(request(2, -.9, .8, true, false)); });
            assertThat(ready.await(2, java.util.concurrent.TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(java.util.stream.Stream.of(first.get(), second.get()).filter(Decision::accepted).count()).isEqualTo(1);
        }
    }
    @Test void 정상점프는_허용하고_공중부양과_수직순간이동은_거절한다() {
        try (var geometry = new TestGeometry(flat(false))) {
            var validator = validator(geometry);
            for (int step = 1; step <= 7; step++) {
                now = step * 100_000_000L;
                double t = step * .1, y = Math.max(.8, .8 + 6.2 * t - 9 * t * t);
                assertThat(validator.accept(request(step, 0, y, false, step == 1)).accepted()).as("jump %s", step).isTrue();
            }
            now += 100_000_000;
            assertThat(validator.accept(request(8, 0, 20, false, true)).reason()).isEqualTo("VERTICAL");
            validator.relocate(new Pose(0, .8, 0), 1);
            now += 100_000_000;
            var first = validator.accept(request(1, 0, 1, false, false));
            now += 100_000_000;
            var second = validator.accept(request(2, 0, 1.2, false, false));
            assertThat(first.accepted() && second.accepted()).isFalse();
        }
    }
    @Test void 도착지가_비어있어도_벽을_통과한_경로는_거절한다() {
        try (var geometry = new TestGeometry(flat(true))) {
            var validator = validator(geometry);
            now = 100_000_000;
            var result = validator.accept(request(1, .9, .8, true, false));
            assertThat(result.reason()).isEqualTo("COLLISION");
            assertThat(result.approved().x()).isZero();
        }
    }
    @Test void 바닥_반대쪽_도착점도_비어있지만_낙하경로의_바닥관통은_거절한다() {
        try (var geometry = new TestGeometry(flat(false))) {
            assertThat(geometry.clear(new Pose(0, 3, 0), new Pose(0, -2, 0), false)).isFalse();
        }
    }
    @Test void 실제지지면_착지는_자유낙하_포물선보다_높아도_허용한다() {
        try (var geometry = new TestGeometry(flat(false))) {
            var validator = new ClientPositionValidator(new Pose(0, 4.68, 0), 1, 79, geometry, () -> now);
            double[] heights = {4.68, 4.6, 4.3, 3.82, 3.16, 2.32, 1.3, .8};
            for (int i = 0; i < heights.length; i++) {
                now = (i + 1) * 100_000_000L;
                assertThat(validator.accept(request(i + 1, 0, heights[i], false, false)).accepted()).as("fall %s", i).isTrue();
            }
        }
    }
    @Test void 지지면이_있어도_정상낙하보다_빠른_하강은_거절한다() {
        try (var geometry = new TestGeometry(flat(false))) {
            var validator = new ClientPositionValidator(new Pose(0, 4.68, 0), 1, 79, geometry, () -> now);
            now = 100_000_000;
            assertThat(validator.accept(request(1, 0, 4.68, false, false)).accepted()).isTrue();
            now = 200_000_000;
            var result = validator.accept(request(2, 0, .8, false, false));
            assertThat(result.reason()).isEqualTo("VERTICAL");
            assertThat(result.approved().y()).isEqualTo(4.68);
        }
    }
    @Test void 천장에_막혀_실패한_점프의_정상_정지좌표를_승인한다() {
        var scene = flat(false);
        var ceiling = ((com.fasterxml.jackson.databind.node.ArrayNode) scene.data.path("boxes")).addObject();
        ceiling.put("id", "prototype-ceiling"); ceiling.put("yaw", 0);
        ceiling.putArray("center").add(0).add(1.75).add(0);
        ceiling.putArray("half").add(5).add(.15).add(5);
        try (var geometry = new TestGeometry(ParkScene.fromPreparedData(scene.data,
                new WorldMapMetadata("park", 1, "c".repeat(64))))) {
            var validator = validator(geometry);
            assertThat(geometry.clear(new Pose(0, .8, 0), new Pose(0, 1.2, 0), false)).isFalse();
            now = 100_000_000;
            assertThat(validator.accept(request(1, 0, .8, false, true)).accepted()).isTrue();
            now = 200_000_000;
            assertThat(validator.accept(request(2, 0, .8, false, false)).accepted()).isTrue();
            now = 300_000_000;
            assertThat(validator.accept(request(3, 0, .8, false, false)).accepted()).isTrue();
        }
    }
    @Test void 클라이언트시각과_접지주장은_입력계약에서_제외한다() throws Exception {
        var json = new ObjectMapper().readTree("{\"seq\":1,\"epoch\":1,\"x\":0,\"y\":0.8,\"z\":0,\"run\":false,\"jump\":false,\"yaw\":0}");
        assertThat(Candidate.parse(json).seq()).isEqualTo(1);
        ((ObjectNode) json).put("timestamp", Long.MAX_VALUE);
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
        ((ObjectNode) json).remove("timestamp"); ((ObjectNode) json).put("grounded", true);
        assertThatThrownBy(() -> Candidate.parse(json)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void 일부_상승후_천장에_닿은_높이에서_정상_낙하를_승인한다() {
        var scene = flat(false);
        var roof = ((com.fasterxml.jackson.databind.node.ArrayNode) scene.data.path("boxes")).addObject();
        roof.put("id", "raised-ceiling"); roof.put("yaw", 0);
        roof.putArray("center").add(0).add(2.05).add(0);
        roof.putArray("half").add(5).add(.1).add(5);
        try (var geometry = new TestGeometry(ParkScene.fromPreparedData(scene.data,
                new WorldMapMetadata("park", 1, "d".repeat(64))))) {
            var validator = validator(geometry);
            for (int i = 0; i < 3; i++) {
                now = (i + 1) * 100_000_000L;
                assertThat(validator.accept(request(i + 1, 0, new double[]{1.14, .99, .8}[i], false, i == 0)).accepted()).isTrue();
            }
        }
    }
    @Test @EnabledIfEnvironmentVariable(named="MOVEMENT_AB_DIR", matches=".+")
    void 실제_Rapier_B궤적을_10Hz로_제출해_보수적검증의_미충족범위를_기록한다() throws Exception {
        Path directory = Path.of(System.getenv("MOVEMENT_AB_DIR"));
        var mapper = new ObjectMapper(); var results = new ArrayList<Map<String, Object>>();
        for (var row : mapper.readTree(Files.readString(directory.resolve("ab-results.json"))).path("results")) {
            if (!row.path("mode").asText().equals("no-replay") || row.path("rttMs").asInt() != 100) continue;
            var samples = row.path("samples"); var initial = samples.get(0).path("predicted"); now = 0;
            try (var geometry = new TestGeometry(ParkScene.load())) {
                var data = ParkScene.load().data;
                double boundary = data.path("world").path("halfSize").asDouble() - data.path("world").path("boundaryHalfDepth").asDouble()
                        - data.path("movement").path("radius").asDouble() - data.path("movement").path("offset").asDouble();
                var validator = new ClientPositionValidator(pose(initial), 1, boundary, geometry, () -> now);
                int accepted = 0, rejected = 0; var reasons = new TreeMap<String, Integer>();
                for (int index = 6; index < samples.size(); index += 6) {
                    var sample = samples.get(index); now = Math.round(sample.path("at").asDouble() * 1_000_000);
                    var decision = validator.accept(new Candidate(index, 1, pose(sample.path("predicted")),
                            sample.path("intent").path("run").asBoolean(), sample.path("intent").path("jump").asBoolean()));
                    if (decision.accepted()) accepted++; else { rejected++; reasons.merge(decision.reason(), 1, Integer::sum); }
                }
                results.add(Map.of("scenario", row.path("scenario").asText(), "accepted", accepted, "rejected", rejected, "reasons", reasons));
            }
        }
        mapper.writerWithDefaultPrettyPrinter().writeValue(directory.resolve("client-validation-local.json").toFile(),
                Map.of("scope", "Local validator over controlled Rapier B positions at 10Hz; real network jitter and service deployment unverified.", "results", results));
        assertThat(results).isNotEmpty();
        assertThat(results).allSatisfy(result -> assertThat(result.get("rejected")).as(result.get("scenario").toString()).isEqualTo(0));
    }
    private static Pose pose(com.fasterxml.jackson.databind.JsonNode node) { return new Pose(node.path("x").asDouble(), node.path("y").asDouble(), node.path("z").asDouble()); }
    private static final class TestGeometry implements Geometry, AutoCloseable {
        private final com.jme3.bullet.PhysicsSpace space = new com.jme3.bullet.PhysicsSpace(com.jme3.bullet.PhysicsSpace.BroadphaseType.DBVT);
        private final PositionCollision collision;
        TestGeometry(ParkScene scene) {
            for (var shape : scene.shapes) {
                if (shape.id().matches(".+-chair-[23]")) continue;
                var body = new com.jme3.bullet.objects.PhysicsRigidBody(shape.shape(), 0);
                body.setPhysicsLocation(shape.center()); body.setPhysicsRotation(shape.rotation());
                body.setCollisionGroup(2); body.setCollideWithGroups(1); space.addCollisionObject(body);
            }
            collision = new PositionCollision(scene, space);
        }
        public boolean supported(Pose pose) { return collision.supported(pose); }
        public boolean clear(Pose from, Pose to, boolean step) { return collision.clear(from, to, step); }
        public Double ceiling(Pose pose, double rise) { return collision.ceiling(pose, rise); }
        public void close() { space.destroy(); }
    }
    private static ParkScene flat(boolean wall) {
        ObjectNode data = (ObjectNode) ParkScene.load().data.deepCopy();
        data.putArray("meshes"); data.putArray("hulls"); data.putArray("steppingStones");
        var boxes = data.putArray("boxes"); var floor = boxes.addObject(); floor.put("id", "prototype-floor");
        floor.putArray("center").add(0).add(-.25).add(0); floor.putArray("half").add(80).add(.25).add(80); floor.put("yaw", 0);
        if (wall) { var box = boxes.addObject(); box.put("id", "prototype-wall");
            box.putArray("center").add(.75).add(2).add(0); box.putArray("half").add(.05).add(2).add(3); box.put("yaw", 0); }
        return ParkScene.fromPreparedData(data, new WorldMapMetadata("park", 1, "b".repeat(64)));
    }
}
