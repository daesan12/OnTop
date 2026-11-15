package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

class ParkMovementPolicyTests {
    private long now;

    @Test
    void 중앙광장_가구_앞에서_정지하고_옆이나_뒤로_움직일_수_있다() throws Exception {
        Path dir = Path.of("../frontend/generated/park-renewal");
        var map = PreparedParkMap.load(dir.resolve("server-map.json"), dir.resolve("manifest.json"), Set.of("channel-1"));
        var policy = map.createScene().policy;
        var start = new Vector3f(8.4f, 4.885f, 27);
        java.util.function.Predicate<String> active = id -> !id.matches("table-\\d+-chair-[2-7]");

        var forward = new Vector3f(.5f, 0, 0);
        var contact = start.add(policy.limitFurnitureTravel(start, forward, active));
        assertThat(contact.x).isBetween(8.60f, 8.65f);
        assertThat(policy.slide(contact, active)).isEqualTo(contact);
        assertThat(policy.limitFurnitureTravel(contact, forward, active)).isEqualTo(Vector3f.ZERO);

        var sideways = new Vector3f(0, 0, .5f);
        var backward = new Vector3f(-.5f, 0, 0);
        assertThat(policy.limitFurnitureTravel(contact, sideways, active)).isEqualTo(sideways);
        assertThat(policy.limitFurnitureTravel(contact, backward, active)).isEqualTo(backward);
    }

    @Test
    void 도착점이_가구를_벗어나도_경로에서_처음_만나는_활성_가구를_막는다() {
        var policy = scene().policy;
        var start = new Vector3f(3.5f, .8f, 0);
        var step = new Vector3f(3, 0, 0);
        assertThat(start.add(policy.limitFurnitureTravel(start, step, id -> true)).x).isBetween(4.25f, 4.30f);
        assertThat(policy.limitFurnitureTravel(start, step, id -> !id.equals("table-1-chair-2"))).isEqualTo(step);
    }

    @Test
    void 돌테이블_모서리의_밀어낼_자리가_막혀도_충돌_직전_위치를_유지한다() {
        ObjectNode data = scene().data.deepCopy();
        ((ObjectNode) data.path("furniturePolicy")).put("exitGap", .18);
        box((com.fasterxml.jackson.databind.node.ArrayNode) data.path("boxes"),
                "wall", -1.75, 1.25, -1, .1, 1.25, 1);
        var blockedExit = ParkScene.fromPreparedData(data, new WorldMapMetadata("park", 2, "e".repeat(64)));
        try (var world = new WorldPhysics(blockedExit, false, () -> now, false)) {
            world.add("a");
            world.place("a", -1.32, .8, -1.31);
            var before = world.snapshot("a");
            assertThat(world.canStand(before.x(), before.y(), before.z())).isTrue();

            now += WorldPhysics.STEP_NANOS;
            world.input("a", new MoveInput(1, .45, .89, false, false), now);
            world.step(now, Set.of());

            var after = world.snapshot("a");
            assertThat(after.motion().epoch()).isGreaterThan(before.motion().epoch());
            assertThat(after.x()).isCloseTo(before.x(), within(.001));
            assertThat(after.z()).isCloseTo(before.z(), within(.001));
        }
    }
    @Test void 가구_내부와_분수_중심의_복구는_서버가_바깥으로_확정하고_착석은_유지한다() {
        try (var world = new WorldPhysics(scene(), true, () -> now, true)) {
            world.add("a"); world.place("a", 0, 1.5, 0);
            var table = world.snapshot("a");
            assertThat(Math.max(Math.abs(table.x()), Math.abs(table.z()))).isGreaterThan(1.3);
            world.place("a", 20, 1, 0);
            var fountain = world.snapshot("a");
            assertThat(fountain.x()).isCloseTo(20, within(.001));
            assertThat(fountain.z()).isGreaterThan(2.3);
            world.hold("a", 0, 1.5, 0, 0);
            var held = world.snapshot("a"); world.step(++now, Set.of("a"));
            assertThat(world.snapshot("a").x()).isEqualTo(held.x());
            assertThat(world.snapshot("a").z()).isEqualTo(held.z());
        }
    }
    @Test void 일반이동과_PARK모두_높은낙하후_차단기둥위에서_정지하지않는다() {
        for (boolean tuned : new boolean[]{false, true}) for (double x : new double[]{0, 20}) {
            try (var world = new WorldPhysics(scene(), false, () -> now, tuned)) {
                world.add("a"); world.place("a", x, 8, 0);
                for (int i = 0; i < 150; i++) { now += WorldPhysics.STEP_NANOS; world.step(now, Set.of()); }
                var end = world.snapshot("a");
                System.out.println("NO_CLIMB_FALL tuned=" + tuned + " x=" + x + " result=" + end);
                assertThat(end.y()).isLessThan(1);
                assertThat(Math.hypot(end.x() - x, end.z())).isGreaterThan(x == 0 ? 1.3 : 2.3);
            }
        }
    }
    @Test void 잔여모서리는_안전지지로_보지않고_비활성의자는_제외한다() {
        var policy = scene().policy;
        assertThat(policy.allowsSupport(new com.jme3.math.Vector3f(0,3.3f,1.34f), id -> true)).isFalse();
        assertThat(policy.allowsSupport(new com.jme3.math.Vector3f(0,.8f,1.34f), id -> true)).isTrue();
        var inside = new com.jme3.math.Vector3f(5,1,0);
        assertThat(policy.slide(inside, id -> !id.equals("table-1-chair-2"))).isEqualTo(inside);
        assertThat(policy.slide(inside, id -> true)).isNotEqualTo(inside);
    }
    @Test void C의_낙하는_승인좌표로_선행보정하며_옛세대와_큰좌표는_승인하지않는다() {
        try (var world = new WorldPhysics(scene(), true, () -> now, true)) {
            world.add("a"); world.place("a", 0, 4, 0);
            long epoch = world.snapshot("a").motion().epoch();
            now = 60_000_000; world.report("a", new Candidate(1, epoch, new Pose(0,3.8,0),false,false), now);
            now += 60_000_000; world.report("a", new Candidate(2, epoch, new Pose(0,3.65,0),false,false), now);
            world.step(now, Set.of());
            var corrected = world.snapshot("a");
            System.out.println("SERVER_EXCLUSION " + corrected);
            assertThat(corrected.motion().epoch()).isNotEqualTo(epoch);
            assertThat(corrected.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(corrected.motion().grounded()).isFalse();
            assertThat(corrected.motion().velocityY()).isNegative();
            assertThat(Math.hypot(corrected.x(), corrected.z())).isGreaterThan(1.3);
            world.report("a",new Candidate(3,epoch,new Pose(70,1,70),true,false),now);
            assertThat(world.snapshot("a")).isEqualTo(corrected);
            world.place("a", 6, .84, 6); now += 60_000_000;
            var rejected = world.report("a",new Candidate(4,world.snapshot("a").motion().epoch(),new Pose(60,.84,60),true,false),now);
            assertThat(rejected.x()).isEqualTo(6);
            assertThat(rejected.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(rejected.motion().correctionReason()).isEqualTo("SPEED");
        }
    }
    @Test void 팔각정_위에서만_두점프프로필을_적용하고_과도한높이는_거절한다() {
        var scene = scene();
        assertThat(scene.policy.jumpSpeed(new com.jme3.math.Vector3f(0,2.8f,0),true)).isEqualTo(8.6);
        assertThat(scene.policy.jumpSpeed(new com.jme3.math.Vector3f(0,2.8f,0),false)).isEqualTo(7.8);
        assertThat(scene.policy.jumpSpeed(new com.jme3.math.Vector3f(7,.8f,7),true)).isEqualTo(8);
        Geometry g = new Geometry() {
            public boolean supported(Pose p) {return p.y() <= 2.85;}
            public boolean clear(Pose a, Pose b, boolean step) {return true;}
            public Double ceiling(Pose p,double rise) {return null;}
            public double jumpSpeed(Pose p,boolean tuned) {return 8.6;}
        };
        var validator = new ClientPositionValidator(new Pose(0,2.8,0),1,80,g,()->now,true);
        now = 100_000_000;
        assertThat(validator.accept(new Candidate(1,1,new Pose(0,4.3,0),false,true)).accepted()).isTrue();
        now += 60_000_000;
        assertThat(validator.accept(new Candidate(2,1,new Pose(0,4.6,0),false,false)).reason()).isEqualTo("JUMP_HEIGHT");
    }
    @Test @EnabledIfEnvironmentVariable(named="TEST_PARK_POLICY_DIR",matches=".+")
    void 실제_MR214_정책과_18개_매핑을_읽고_구버전도_호환한다() throws Exception {
        Path input = Path.of(System.getenv("TEST_PARK_POLICY_DIR"));
        for (String directory : new String[]{"mr-209","mr-214"}) {
            var park = com.ssafy.ontop.world.map.PreparedParkMap.load(input.resolve(directory+"/server-map.json"),input.resolve(directory+"/manifest.json"),Set.of("channel-1"));
            assertThat(park.bindings()).hasSize(18);
            var loaded = park.createScene();
            if (directory.equals("mr-214")) {
                assertThat(park.metadata().mapVersion()).isEqualTo("04350122fdeee2b89212345ee4f776990d78832bb25435418b5ea6f2b2fbc769");
                assertThat(park.collisionData().path("pavilionTunedJumpSpeed").asDouble()).isEqualTo(8.6);
                assertThat(loaded.policy.jumpSpeed(new com.jme3.math.Vector3f(0,2.8f,6),true)).isEqualTo(8.6);
            }
        }
    }
    @Test void 팔각정_점프는_출발정책을_유지하고_tuned는_native로_전환하지않는다() {
        ObjectNode data=(ObjectNode)scene().data.deepCopy();
        box((com.fasterxml.jackson.databind.node.ArrayNode)data.path("boxes"),"pavilion-floor",0,1,0,4.5,1,4.5);
        var scene=ParkScene.fromPreparedData(data,new WorldMapMetadata("park",2,"b".repeat(64)));
        for(boolean tuned:new boolean[]{false,true})try(var world=new WorldPhysics(scene,true,()->now,tuned)){
            now=0; world.add("a");world.place("a",3,2.84,0);now=10_000_000;
            var approved=world.report("a",new Candidate(1,world.snapshot("a").motion().epoch(),new Pose(3,3.0,0),false,true),now);
            assertThat(approved.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(approved.motion().velocityY()).isCloseTo(tuned?8.6:7.8,within(.0001));
            world.serverMovement("a");now+=WorldPhysics.STEP_NANOS;world.step(now,Set.of());
            if (tuned) {
                assertThat(world.snapshot("a").y()).isEqualTo(3);
                assertThat(world.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
                var next=world.report("a",new Candidate(2,approved.motion().epoch(),new Pose(3,3.2,0),false,false),now);
                assertThat(next.motion().correctionReason()).isNull();assertThat(next.y()).isCloseTo(3.2,within(.001));
            } else assertThat(world.snapshot("a").y()).isGreaterThan(3.15);
        }
    }
    @Test void 실제_MR214의_모든_탁자는_인원변경과_착석_하차시_안전위치를_유지한다() throws Exception {
        String root=System.getenv("TEST_PARK_POLICY_DIR");
        org.junit.jupiter.api.Assumptions.assumeTrue(root!=null);
        Path dir=Path.of(root,"mr-214");
        var park=com.ssafy.ontop.world.map.PreparedParkMap.load(dir.resolve("server-map.json"),dir.resolve("manifest.json"),Set.of("channel-1"));
        try(var world=new WorldPhysics(park.createScene())) {
            world.add("a");
            for(var binding:park.bindings()) {
                String anchor=binding.anchorId();
                for(int count:new int[]{2,4,2})world.chairCounts(Map.of(anchor,count));
                var table=java.util.stream.StreamSupport.stream(park.collisionData().path("boxes").spliterator(),false)
                        .filter(b->b.path("id").asText().equals(anchor+"-top")).findFirst().orElseThrow();
                double x=table.path("center").get(0).asDouble(),y=table.path("center").get(1).asDouble(),z=table.path("center").get(2).asDouble();
                world.hold("a",x,y,z,0);
                var held=world.snapshot("a");world.chairCounts(Map.of(anchor,4));
                assertThat(world.snapshot("a")).as(anchor+" held").isEqualTo(held);
                // A server-authorized exit inside the movement column must be normalized.
                world.place("a",x,y,z);
                // place preserves seated until the next physical tick, as the normal registry release does.
                now+=WorldPhysics.STEP_NANOS;world.step(now,Set.of());
                var exit=world.snapshot("a");
                assertThat(Math.hypot(exit.x()-x,exit.z()-z)).as(anchor+" exit").isGreaterThan(.3);
            }
        }
    }
    @Test void 반경중복적용이나_형상과다른_정책은_시작전에_거절한다() {
        ObjectNode inflated=(ObjectNode)scene().data.deepCopy();
        ((ObjectNode)inflated.path("furniturePolicy")).put("characterRadiusIncluded",true);
        assertThatThrownBy(()->ParkScene.fromPreparedData(inflated,new WorldMapMetadata("park",2,"c".repeat(64))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("가구 차단 정책");
        ObjectNode mismatch=(ObjectNode)scene().data.deepCopy();
        ((ObjectNode)mismatch.path("fountainPolicy")).put("radius",3);
        assertThatThrownBy(()->ParkScene.fromPreparedData(mismatch,new WorldMapMetadata("park",2,"d".repeat(64))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("충돌 hull");
    }
    private static ParkScene scene() {
        ObjectNode data = (ObjectNode) ParkScene.load().data.deepCopy();
        var terrain = data.path("meshes").get(0).deepCopy();
        var vertices = (com.fasterxml.jackson.databind.node.ArrayNode)terrain.path("vertices");
        for (int i=1;i<vertices.size();i+=3) vertices.set(i,vertices.numberNode(0));
        data.putArray("meshes").add(terrain); data.putArray("steppingStones");
        ((ObjectNode)data.path("lake")).put("x",1000).put("z",1000);
        var boxes = data.putArray("boxes");
        box(boxes,"table-1-top",0,1.25,0,1,1.25,1);
        box(boxes,"table-1-chair-2",5,1.25,0,.4,1.25,.4);
        var hull = data.putArray("hulls").addObject(); hull.put("id","fountain-basin");
        var points = hull.putArray("vertices");
        for(double y:new double[]{-1,2.5})for(int i=0;i<48;i++){double a=i*Math.PI/24;points.add(20+Math.cos(a)*2).add(y).add(Math.sin(a)*2);}
        var fp=data.putObject("furniturePolicy"); fp.put("kind","no-climb").put("landing","slide-out").put("movementHeight",2.5).put("exitGap",.03).put("landingHeightTolerance",.12).put("characterRadiusIncluded",false);
        var f=data.putObject("fountainPolicy");f.put("kind","no-climb").put("shape","cylinder").put("id","fountain-basin").put("landing","slide-out").put("x",20).put("z",0).put("radius",2).put("bottom",-1).put("top",2.5).put("exitGap",.03).put("characterRadiusIncluded",false);
        data.put("pavilionJumpSpeed",7.8).put("pavilionTunedJumpSpeed",8.6);
        data.putArray("pavilions").addObject().put("x",0).put("z",0).put("floor",2).put("scale",1);
        return ParkScene.fromPreparedData(data,new WorldMapMetadata("park",2,"a".repeat(64)));
    }
    private static void box(com.fasterxml.jackson.databind.node.ArrayNode boxes,String id,double x,double y,double z,double hx,double hy,double hz){
        var b=boxes.addObject();b.put("id",id).put("yaw",0);b.putArray("center").add(x).add(y).add(z);b.putArray("half").add(hx).add(hy).add(hz);
    }
}
