package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class UnifiedMovementTests {
    private final AtomicLong now = new AtomicLong();
    private static ParkScene flat() {
        var data = (ObjectNode)ParkScene.load().data.deepCopy();
        var terrain = data.path("meshes").get(0).deepCopy();
        data.putArray("meshes").add(terrain); data.putArray("hulls"); data.putArray("steppingStones");
        var floor = data.putArray("boxes").addObject(); floor.put("id","floor"); floor.put("yaw",0);
        floor.putArray("center").add(0).add(-.25).add(0); floor.putArray("half").add(80).add(.25).add(80);
        return ParkScene.fromPreparedData(data, new WorldMapMetadata("park",1,"b".repeat(64)));
    }
    private static ParkScene generated() throws Exception {
        return PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1")).createScene();
    }
    @Test void 검증거절은_같은_이동으로_복구하고_새보고와_이전세대를_구분한다() {
        try (var world = new WorldPhysics(flat(),true,now::get,true)) {
            world.add("a"); world.place("a",-10,.84,42);
            var initial = world.snapshot("a"); now.set(60_000_000);
            var denied = world.report("a",new Candidate(1,initial.motion().epoch(),new Pose(40,.84,42),true,false),now.get());
            assertThat(denied.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(denied.motion().profile()).isEqualTo("PARK_V1");
            assertThat(denied.motion().correctionReason()).isEqualTo("SPEED");
            assertThat(denied.motion().epoch()).isNotEqualTo(initial.motion().epoch());
            assertThat(denied.x()).isEqualTo(initial.x());
            now.addAndGet(60_000_000);
            var resumed=world.report("a",new Candidate(2,denied.motion().epoch(),new Pose(-9.8,.84,42),false,false),now.get());
            assertThat(resumed.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(resumed.x()).isCloseTo(-9.8,within(.00001));
            assertThat(resumed.motion().correctionReason()).isNull();
            var stale=world.report("a",new Candidate(999,initial.motion().epoch(),new Pose(40,.84,42),true,false),now.get());
            assertThat(stale).isEqualTo(resumed);
        }
    }
    @Test void 보정세대_반복은_이동예산이나_점프를_재충전하지않는다() {
        Geometry geometry=new Geometry(){
            public boolean supported(Pose p){return p.y()<=.85;}
            public boolean clear(Pose a,Pose b,boolean step){return true;}
            public Double ceiling(Pose p,double rise){return null;}
        };
        var v=new ClientPositionValidator(new Pose(0,.8,0),1,79,geometry,now::get,true);
        now.set(60_000_000);assertThat(v.accept(new Candidate(1,1,new Pose(.89,.8,0),false,false)).accepted()).isTrue();
        for(int epoch=2;epoch<=25;epoch++){
            v.resynchronize(epoch);
            assertThat(v.accept(new Candidate(epoch,epoch,new Pose(1.6,.8,0),false,false)).reason()).isEqualTo("SPEED");
        }
        assertThat(v.accept(new Candidate(26,25,new Pose(.9,.8,0),false,false)).accepted()).isTrue();
        assertThat(v.accept(new Candidate(26,25,new Pose(2,.8,0),false,false)).reason()).isEqualTo("SEQUENCE");
    }
    @Test void 무보고_공중사용자는_안전지면으로_복구한뒤_같은물리로_다시보고한다(){
        try(var world=new WorldPhysics(flat(),true,now::get,true)){
            world.add("a");world.place("a",-10,5,42);var first=world.snapshot("a");
            now.set(60_000_000);var accepted=world.report("a",new Candidate(1,first.motion().epoch(),new Pose(-10,4.9,42),false,false),now.get());
            assertThat(accepted.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            now.set(2_100_000_000L);world.step(now.get(),Set.of());var expired=world.snapshot("a");
            assertThat(expired.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(expired.motion().correctionReason()).isEqualTo("REPORT_EXPIRED");
            assertThat(expired.y()).isBetween(.77,1.2);
            now.addAndGet(60_000_000);var resumed=world.report("a",new Candidate(2,expired.motion().epoch(),new Pose(expired.x(),expired.y(),expired.z()),false,false),now.get());
            assertThat(resumed.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(resumed.motion().appliedInputSeq()).isEqualTo(2);
        }
    }
    @Test void 수영과_전망대에서는_좌표검증모드를_그대로_유지한다() throws Exception {
        var scene=generated();
        try(var world=new WorldPhysics(scene,true,now::get,true)){
            world.add("a");var lake=scene.data.path("lake");
            double x=lake.path("x").asDouble(),z=lake.path("z").asDouble();
            double floating=lake.path("surfaceY").asDouble()+scene.data.path("swimming").path("floatOffset").asDouble();
            world.place("a",x,floating-.2,z);var initial=world.snapshot("a");
            now.set(60_000_000);var water=world.report("a",new Candidate(1,initial.motion().epoch(),new Pose(x+.05,floating-.15,z),false,false),now.get());
            assertThat(water.swimming()).isTrue();assertThat(water.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(water.motion().correctionReason()).isNull();world.step(now.get(),Set.of());
            assertThat(world.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            var t=scene.data.path("tower");double radius=(t.path("inner").asDouble()+t.path("outer").asDouble())/2;
            world.place("a",t.path("x").asDouble()+radius,t.path("surfaceOffset").asDouble(.12)+.88,t.path("z").asDouble());
            var tower=world.snapshot("a");now.addAndGet(60_000_000);world.step(now.get(),Set.of());
            assertThat(world.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            var still=world.report("a",new Candidate(2,tower.motion().epoch(),new Pose(tower.x(),tower.y(),tower.z()),false,false),now.get());
            assertThat(still.motion().authority()).isEqualTo("CLIENT_VALIDATED");assertThat(still.motion().correctionReason()).isNull();
        }
    }
    @Test void 서버_따라가기방향만_전달하고_물리방식은_교체하지않는다(){
        try(var world=new WorldPhysics(flat(),true,now::get,true)){
            world.add("a");world.add("b");world.place("a",-10,.84,42);world.place("b",-2,.84,42);
            world.serverMovement("a");world.step(now.get(),Set.of(),Map.of("a","b"));var directed=world.snapshot("a");
            assertThat(directed.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(directed.motion().steering()).isNotNull();assertThat(directed.motion().steering().dx()).isCloseTo(1,within(.001));
            assertThat(directed.motion().steering().run()).isTrue();assertThat(directed.x()).isEqualTo(-10);
            world.place("b",-7.9,.84,42);world.step(now.get(),Set.of(),Map.of("a","b"));
            assertThat(world.snapshot("a").motion().steering().dx()).isZero();
            world.step(now.get(),Set.of(),Map.of());assertThat(world.snapshot("a").motion().steering()).isNull();
        }
    }
    @Test void 물영역의_부력만_허용하고_수면초과와_육지공중상승은_거절한다(){
        Geometry water=new Geometry(){
            public boolean supported(Pose p){return false;} public boolean clear(Pose a,Pose b,boolean s){return true;}
            public Double ceiling(Pose p,double h){return null;} public boolean swimming(Pose p){return p.x()>0;}
            public double floatY(){return 0;}
        };
        var v=new ClientPositionValidator(new Pose(1,-.2,0),1,79,water,now::get,true);
        now.set(60_000_000);assertThat(v.accept(new Candidate(1,1,new Pose(1,-.1,0),false,false)).accepted()).isTrue();
        now.addAndGet(60_000_000);assertThat(v.accept(new Candidate(2,1,new Pose(1,.5,0),false,false)).accepted()).isFalse();
        var land=new ClientPositionValidator(new Pose(-1,.8,0),1,79,water,now::get,true);
        now.addAndGet(60_000_000);assertThat(land.accept(new Candidate(1,1,new Pose(-1,1.1,0),false,false)).reason()).isEqualTo("JUMP_REQUIRED");
    }
    @Test void 직접조작_표식은_선택필드이고_다른타입은_거절한다() throws Exception{
        var node=new ObjectMapper().createObjectNode().put("seq",1).put("epoch",1).put("x",0).put("y",.8).put("z",0).put("yaw",0).put("run",false).put("jump",false);
        assertThat(Candidate.parse(node).manual()).isTrue();node.put("manual",false);assertThat(Candidate.parse(node).manual()).isFalse();
        node.put("manual","false");assertThatThrownBy(()->Candidate.parse(node)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void float경계의_미세반올림은_내부로_제한하고_실제초과는_거절한다(){
        Geometry flat=new Geometry(){public boolean supported(Pose p){return true;}public boolean clear(Pose a,Pose b,boolean step){return true;}public Double ceiling(Pose p,double rise){return null;}};
        double boundary=89.33,rounded=(double)(float)boundary;
        var v=new ClientPositionValidator(new Pose(boundary-.5,.8,0),1,boundary,flat,now::get,true);
        now.set(100_000_000);var accepted=v.accept(new Candidate(1,1,new Pose(rounded,.8,0),true,false));
        assertThat(accepted.accepted()).isTrue();assertThat(accepted.approved().x()).isEqualTo(boundary);
        now.addAndGet(60_000_000);assertThat(v.accept(new Candidate(2,1,new Pose(boundary+.001,.8,0),true,false)).reason()).isEqualTo("BOUNDS");
        assertThatCode(()->new ClientPositionValidator(new Pose(rounded,.8,0),2,boundary,flat,now::get,true)).doesNotThrowAnyException();
    }
}
