package com.ssafy.ontop.world.movement;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.*;
class TunedMovementValidatorTests {
 private long now;
 private final Geometry ground = new Geometry() {
  public boolean supported(Pose p){return p.y() <= .85;}
  public boolean clear(Pose a,Pose b,boolean step){return true;}
  public Double ceiling(Pose p,double rise){return null;}
 };
 private ClientPositionValidator validator(boolean tuned){return new ClientPositionValidator(new Pose(0,.8,0),1,79,ground,()->now,tuned);}
 private Candidate move(long n,double x,double y){return new Candidate(n,1,new Pose(x,y,0),true,false);}
 private Candidate jump(long n,double y){return new Candidate(n,1,new Pose(0,y,0),true,true);}
 @Test void 착지직전_수신한_점프입력은_짧은착지후_상승에_한번만_사용한다(){
  var v=validator(true);now=60_000_000;assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
  now=200_000_000;assertThat(v.accept(move(2,0,1.8)).accepted()).isTrue();
  now=400_000_000;assertThat(v.accept(jump(3,1.7)).accepted()).isTrue();
  now=460_000_000;assertThat(v.accept(move(4,0,.84)).accepted()).isTrue();
  now=520_000_000;assertThat(v.accept(move(5,0,1.3)).accepted()).isTrue();
  now=720_000_000;assertThat(v.accept(move(6,0,2.4)).reason()).isEqualTo("JUMP_HEIGHT");
 }
 @Test void 만료됐거나_보정세대가_바뀐_입력으로_공중점프를_만들지않는다(){
  for(boolean corrected:new boolean[]{false,true}){
   now=0;var v=validator(true);now=60_000_000;assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
   now=200_000_000;assertThat(v.accept(move(2,0,1.8)).accepted()).isTrue();
   now=400_000_000;assertThat(v.accept(jump(3,1.7)).accepted()).isTrue();
   now=460_000_000;assertThat(v.accept(move(4,0,.84)).accepted()).isTrue();
   if(corrected)v.resynchronize(2);now=corrected?520_000_000:700_000_000;
   assertThat(v.accept(new Candidate(5,corrected?2:1,new Pose(0,1.3,0),true,false)).reason()).isEqualTo("JUMP_REQUIRED");
  }
 }
 @Test void 점프후_계단을_오르는_지지이동에_이전점프의_높이상한을_적용하지않는다(){
  Geometry stairs=new Geometry(){
   public boolean supported(Pose p){return p.y()<=.85||p.y()>=1.8;}
   public boolean clear(Pose a,Pose b,boolean step){return true;}
   public Double ceiling(Pose p,double rise){return null;}
  };
  var v=new ClientPositionValidator(new Pose(0,.8,0),1,79,stairs,()->now,true);
  now=60_000_000;assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
  now=200_000_000;assertThat(v.accept(move(2,.2,1.8)).accepted()).isTrue();
  now=260_000_000;assertThat(v.accept(move(3,.4,2.1)).accepted()).isTrue();
  now=320_000_000;assertThat(v.accept(move(4,.6,2.4)).accepted()).isTrue();
 }
 @Test void 짧은_렌더링지연을_무조건_보고만료로_거절하지않는다(){
  var v=validator(true);now=100_000_000;assertThat(v.accept(move(1,0,.8)).accepted()).isTrue();
  now=1_300_000_000L;assertThat(v.accept(move(2,.8,.8)).accepted()).isTrue();
 }
 @Test void 공중에서_렌더링이_멈췄다가_복귀해도_연속공중정체로_오판하지않는다(){
  var v=validator(true);now=100_000_000;assertThat(v.accept(jump(1,1.2)).accepted()).isTrue();
  now=1_700_000_000L;assertThat(v.accept(move(2,0,1.5)).accepted()).isTrue();
  for(int i=0;i<13;i++){now+=100_000_000;assertThat(v.accept(move(i+3,0,1.5)).accepted()).isTrue();}
  now+=300_000_000;
  assertThat(v.accept(move(16,0,1.5)).accepted()).isTrue();
  now+=100_000_000;assertThat(v.accept(move(17,0,1.5)).reason()).isEqualTo("HOVER");
 }
 @Test void 선택된_낙하은_정상_고속낙하를_22m속도한계로_오판하지않는다(){
  var v=new ClientPositionValidator(new Pose(0,40,0),1,79,ground,()->now,true);
  now=100_000_000;assertThat(v.accept(move(1,0,36)).accepted()).isTrue();
  now+=100_000_000;assertThat(v.accept(move(2,0,32)).accepted()).isTrue();
  now+=100_000_000;assertThat(v.accept(move(3,0,0)).reason()).isEqualTo("VERTICAL");
 }
 @Test void 작은_점프시각차이는_조정이동시안에서_허용하되_기존정책은_유지한다(){
  var strict=validator(false);var tuned=validator(true);now=100_000_000;
  assertThat(strict.accept(move(1,.5,1.1)).accepted()).isFalse();
  assertThat(tuned.accept(new Candidate(1,1,new Pose(.5,1.1,0),true,true)).accepted()).isTrue();
 }
 @Test void 로컬시안도_순간이동과_비정상수직이동은_차단한다(){
  var v=validator(true);now=100_000_000;
  assertThat(v.accept(move(1,40,.8)).reason()).isEqualTo("SPEED");
  assertThat(v.accept(move(1,0,20)).reason()).isEqualTo("VERTICAL");
  assertThat(v.accept(move(1,Double.NaN,.8)).reason()).isEqualTo("INVALID");
 }
 @Test void 공중에_멈춰있는_보고는_계속_승인하지않는다(){
  var v=validator(true);
  for(int i=1;i<=16;i++){now=i*100_000_000L;assertThat(v.accept(i==1?jump(i,1.2):move(i,0,1.2)).accepted()).isTrue();}
  now=1_700_000_000L;assertThat(v.accept(move(17,0,1.2)).reason()).isEqualTo("HOVER");
 }
 @Test void 실제_서버물리와_연결해도_작은_수직차이로_C를_끄지않는다(){
  try(var physics=new WorldPhysics(ParkScene.load(),true,()->now,true)){
   physics.add("a");physics.place("a",-10,.84,42);now=100_000_000;
   var state=physics.report("a",new Candidate(1,physics.snapshot("a").motion().epoch(),new Pose(-9.5,1.1,42),true,true),now);
   assertThat(state.motion().authority()).isEqualTo("CLIENT_VALIDATED");
   assertThat(state.y()).isCloseTo(1.1,within(.001));
  }
 }

 @Test void 점프없는_반복상승과_최대높이초과는_거절한다(){
  var v=validator(true);now=100_000_000;
  assertThat(v.accept(move(1,0,1.3)).reason()).isEqualTo("JUMP_REQUIRED");
  assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
  now+=100_000_000;assertThat(v.accept(move(2,0,1.8)).accepted()).isTrue();
  now+=100_000_000;assertThat(v.accept(move(3,0,2.3)).reason()).isEqualTo("JUMP_HEIGHT");
 }
 @Test void 선택한_점프와_착지는_프레임포물선일치를_요구하지않는다(){
  var v=validator(true);double[] heights={.8,1.24,1.6,1.82,1.99,2.0,1.95,1.75,1.5,1.2,.8};
  for(int i=0;i<heights.length;i++){now+=60_000_000;var c=new Candidate(i+1,1,new Pose(0,heights[i],0),false,i==0);assertThat(v.accept(c).accepted()).as("sample %s",i).isTrue();}
  now+=60_000_000;assertThat(v.accept(jump(heights.length+1,1.2)).accepted()).isTrue();
 }
 @Test void 낮은의자도_전체캡슐경로로_차단한다(){
  var data=(com.fasterxml.jackson.databind.node.ObjectNode)ParkScene.load().data.deepCopy();
  var terrain=data.path("meshes").get(0).deepCopy();
  data.putArray("meshes").add(terrain);data.putArray("hulls");data.putArray("steppingStones");
  var boxes=data.putArray("boxes");var floor=boxes.addObject();floor.put("id","floor");floor.put("yaw",0);
  floor.putArray("center").add(0).add(-.25).add(0);floor.putArray("half").add(80).add(.25).add(80);
  var obstacle=boxes.addObject();obstacle.put("id","low-obstacle");obstacle.put("yaw",0);
  obstacle.putArray("center").add(.75).add(.2).add(0);obstacle.putArray("half").add(.05).add(.2).add(2);
  var scene=ParkScene.fromPreparedData(data,new com.ssafy.ontop.world.dto.WorldMapMetadata("park",1,"a".repeat(64)));
  try(var physics=new WorldPhysics(scene,true,()->now,true)){
   physics.add("a");physics.place("a",0,.84,0);
   physics.report("a",new Candidate(1,physics.snapshot("a").motion().epoch(),new Pose(0,.84,0),true,false),now);
   now=200_000_000;
   var state=physics.report("a",new Candidate(2,physics.snapshot("a").motion().epoch(),new Pose(1.5,.84,0),true,false),now);
   assertThat(state.x()).isZero();assertThat(state.motion().authority()).isEqualTo("CLIENT_VALIDATED");
   assertThat(state.motion().correctionReason()).isEqualTo("COLLISION");
  }
 }

 @Test void 지연되어_확인된_점프신호는_최고점_안에서만_승인한다(){
  var v=validator(true);now=50_000_000;assertThat(v.accept(jump(1,2.0)).accepted()).isTrue();
  now+=50_000_000;assertThat(v.accept(move(2,0,2.3)).reason()).isEqualTo("JUMP_HEIGHT");
 }
 @Test void 착지보고에_새점프가_겹쳐도_이전점프의_착지로_지우지않는다(){
  var v=validator(true);now=60_000_000;assertThat(v.accept(jump(1,1.2)).accepted()).isTrue();
  now=160_000_000;assertThat(v.accept(move(2,0,1.7)).accepted()).isTrue();
  now=660_000_000;assertThat(v.accept(jump(3,.84)).accepted()).isTrue();
  now+=60_000_000;assertThat(v.accept(move(4,0,1.3)).accepted()).isTrue();
  now+=60_000_000;assertThat(v.accept(move(5,0,1.7)).accepted()).isTrue();
 }
 @Test void 공중에서_점프표시를_반복해도_높이상한을_재충전하지않는다(){
  var v=validator(true);now=60_000_000;assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
  now+=200_000_000;assertThat(v.accept(jump(2,1.9)).accepted()).isTrue();
  now+=200_000_000;assertThat(v.accept(jump(3,2.5)).reason()).isEqualTo("JUMP_HEIGHT");
 }
 @Test void 닿지못한_높은발판을_목적지로_주장해서_점프상한을_초기화하지못한다(){
  Geometry platforms=new Geometry(){
   public boolean supported(Pose p){return p.y()<=.85||Math.abs(p.y()-2.5)<.01;}
   public boolean clear(Pose a,Pose b,boolean step){return true;}
   public Double ceiling(Pose p,double rise){return null;}
  };
  var v=new ClientPositionValidator(new Pose(0,.8,0),1,79,platforms,()->now,true);
  now=60_000_000;assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
  now+=200_000_000;assertThat(v.accept(move(2,0,1.9)).accepted()).isTrue();
  now+=200_000_000;assertThat(v.accept(jump(3,2.5)).reason()).isEqualTo("JUMP_HEIGHT");
 }
 @Test void 작은상승이라도_지지목적지로_기존상한을_넘겨_재충전하지못한다(){
  Geometry platforms=new Geometry(){
   public boolean supported(Pose p){return p.y()<=.85||p.y()>=2.26;}
   public boolean clear(Pose a,Pose b,boolean step){return true;}
   public Double ceiling(Pose p,double rise){return null;}
  };
  var v=new ClientPositionValidator(new Pose(0,.8,0),1,79,platforms,()->now,true);
  now=60_000_000;assertThat(v.accept(jump(1,1.3)).accepted()).isTrue();
  now+=200_000_000;assertThat(v.accept(move(2,0,2.22)).accepted()).isTrue();
  now+=200_000_000;assertThat(v.accept(jump(3,2.26)).reason()).isEqualTo("JUMP_HEIGHT");
 }
}
