package com.ssafy.ontop.world.movement;
import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
class BackgroundFollowTests {
 private final AtomicLong now=new AtomicLong();
 private ParkScene flat(){
  var data=(ObjectNode)ParkScene.load().data.deepCopy();var mesh=data.path("meshes").get(0).deepCopy();data.putArray("meshes").add(mesh);data.putArray("hulls");data.putArray("steppingStones");
  var floor=data.putArray("boxes").addObject();floor.put("id","floor");floor.put("yaw",0);floor.putArray("center").add(0).add(-.25).add(0);floor.putArray("half").add(80).add(.25).add(80);
  return ParkScene.fromPreparedData(data,new WorldMapMetadata("park",1,"c".repeat(64)));
 }
 private void step(WorldPhysics w,int ticks,Map<String,String> following){for(int n=0;n<ticks;n++){now.addAndGet(WorldPhysics.STEP_NANOS);w.step(now.get(),Set.of(),following);}}
 @Test void 최소화처럼_보고가_30초없어도_대상을_계속_추적하고_정지재개한다(){
  try(var w=new WorldPhysics(flat(),true,now::get,true)){
   w.add("a");w.add("b");w.place("a",-20,.84,42);w.place("b",-12,.84,42);w.followMovement("a");long epoch=w.snapshot("a").motion().epoch();
   for(int n=0;n<10;n++){
    double previous=w.snapshot("a").x();w.place("b",previous+8,.84,42);step(w,90,Map.of("a","b"));var follower=w.snapshot("a");
    assertThat(follower.x()).isCloseTo(previous+5.8,within(.02));assertThat(follower.moving()).isFalse();assertThat(follower.motion().authority()).isNull();assertThat(follower.motion().epoch()).isEqualTo(epoch);assertThat(follower.lastInputSeq()).isZero();
   }
   w.stop("a");step(w,1,Map.of());assertThat(w.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
  }
 }
 @Test void 자동이동도_활동으로_판정하고_수동점프로_해제하면_같은점프를_인계한다(){
  try(var w=new WorldPhysics(flat(),true,now::get,true)){
   w.add("a");w.add("b");w.place("a",0,.84,42);w.place("b",8,.84,42);w.followMovement("a");step(w,12,Map.of("a","b"));assertThat(w.hasMovementActivity("a",now.get())).isTrue();
   assertThat(w.input("a",new MoveInput(1,0,0,false,true),now.get())).isTrue();step(w,1,Map.of());var handoff=w.snapshot("a");
   assertThat(handoff.motion().authority()).isEqualTo("CLIENT_VALIDATED");assertThat(handoff.motion().velocityY()).isEqualTo(8);assertThat(handoff.motion().grounded()).isFalse();
   now.addAndGet(100_000_000);var accepted=w.report("a",new ClientPositionValidator.Candidate(2,handoff.motion().epoch(),new ClientPositionValidator.Pose(handoff.x(),handoff.y()+.7,handoff.z()),false,false),now.get());
   assertThat(accepted.motion().correctionReason()).isNull();assertThat(accepted.y()).isCloseTo(handoff.y()+.7,within(.001));
  }
 }
 @Test void 시작직후_첫물리틱전에도_점프로_따라가기를_해제할수있다(){
  try(var w=new WorldPhysics(flat(),true,now::get,true)){
   w.add("a");w.add("b");w.place("a",0,.84,42);w.place("b",8,.84,42);w.followMovement("a");
   assertThat(w.input("a",new MoveInput(1,0,0,false,true),now.get())).isTrue();step(w,1,Map.of());var handoff=w.snapshot("a");
   assertThat(handoff.motion().authority()).isEqualTo("CLIENT_VALIDATED");assertThat(handoff.motion().velocityY()).isEqualTo(8);assertThat(handoff.motion().grounded()).isFalse();
  }
 }
 @Test void 자동이동을_중단해도_새로운_공짜_이동예산을_주지않는다(){
  try(var w=new WorldPhysics(flat(),true,now::get,true)){
   w.add("a");w.add("b");w.place("a",0,.84,42);w.place("b",8,.84,42);w.followMovement("a");step(w,1,Map.of("a","b"));w.stop("a");step(w,1,Map.of());var base=w.snapshot("a");
   var denied=w.report("a",new ClientPositionValidator.Candidate(1,base.motion().epoch(),new ClientPositionValidator.Pose(base.x()+.5,base.y(),base.z()),true,false),now.get());
   assertThat(denied.motion().correctionReason()).isEqualTo("SPEED");assertThat(denied.x()).isEqualTo(base.x());
  }
 }
 @Test void 보고없는_따라가기도_벽을_통과하지않고_수동복귀는_현재좌표다(){
  try(var w=new WorldPhysics(ParkScene.load(),true,now::get,true)){
   w.add("a");w.add("b");w.place("a",-10,.84,22);w.place("b",-10,.84,15);w.followMovement("a");step(w,150,Map.of("a","b"));var blocked=w.snapshot("a");
   assertThat(blocked.z()).isGreaterThan(19);assertThat(blocked.y()).isBetween(.7,.95);w.stop("a");step(w,1,Map.of());var resumed=w.snapshot("a");
   assertThat(resumed.motion().authority()).isEqualTo("CLIENT_VALIDATED");assertThat(resumed.z()).isCloseTo(blocked.z(),within(.002));
  }
 }
}
