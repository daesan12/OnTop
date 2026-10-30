package com.ssafy.ontop.world.movement;
import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
@EnabledIfEnvironmentVariable(named="OBSTACLE_CONTACT_DIR",matches=".+")
class ObstacleContactParityTests {
 @Test void 실제_울타리벤치_접촉궤적을_서버가_반복보정없이_처리한다() throws Exception {
  var dir=Path.of(System.getenv("OBSTACLE_CONTACT_DIR"));var mapper=new ObjectMapper();
  var scene=PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1")).createScene();
  var failures=new ArrayList<Map<String,Object>>();int accepted=0;
  for(var trace:mapper.readTree(dir.resolve("obstacle-traces.json").toFile())){
   var now=new AtomicLong();try(var w=new WorldPhysics(scene,true,now::get,true)){
    var chairCounts=new HashMap<String,Integer>();for(var b:scene.data.path("boxes")){String id=b.path("id").asText();if(id.matches(".+-chair-[0-3]"))chairCounts.put(id.substring(0,id.lastIndexOf("-chair-")),2);}w.chairCounts(chairCounts);
    w.add("a");var p=trace.path("initial");w.place("a",p.path("x").asDouble(),p.path("y").asDouble(),p.path("z").asDouble());long epoch=w.snapshot("a").motion().epoch(),seq=0;
    for(var sample:trace.path("samples")){
     now.set(Math.round(sample.path("at").asDouble()*1e9));p=sample.path("pose");var before=w.snapshot("a");
     var result=w.report("a",new ClientPositionValidator.Candidate(++seq,epoch,new ClientPositionValidator.Pose(p.path("x").asDouble(),p.path("y").asDouble(),p.path("z").asDouble()),sample.path("run").asBoolean(),sample.path("jump").asBoolean()),now.get());
     if(result.motion().correctionReason()!=null){failures.add(Map.of("scenario",trace.path("scenario").asText(),"at",sample.path("at").asDouble(),"reason",result.motion().correctionReason(),"from",before,"to",p,"geometry",diagnose(scene,before,p)));break;}accepted++;w.step(now.get(),Set.of());
    }
   }
  }
  mapper.writerWithDefaultPrettyPrinter().writeValue(dir.resolve("obstacle-validation.json").toFile(),Map.of("accepted",accepted,"firstRejections",failures));
  assertThat(failures).as("See obstacle-validation.json for actual contact coordinates").isEmpty();
 }
 private Map<String,Object> diagnose(ParkScene scene,WorldPhysics.Snapshot from,com.fasterxml.jackson.databind.JsonNode to){
  var space=new com.jme3.bullet.PhysicsSpace(com.jme3.bullet.PhysicsSpace.BroadphaseType.DBVT);
  try{
   for(var shape:scene.shapes){if(shape.id().matches(".+-chair-[23]"))continue;var body=new com.jme3.bullet.objects.PhysicsRigidBody(shape.shape(),0);body.setPhysicsLocation(shape.center());body.setPhysicsRotation(shape.rotation());body.setCollisionGroup(2);body.setCollideWithGroups(1);body.setUserObject(shape.id());space.addCollisionObject(body);}
   var a=new ClientPositionValidator.Pose(from.x(),from.y(),from.z());var b=new ClientPositionValidator.Pose(to.path("x").asDouble(),to.path("y").asDouble(),to.path("z").asDouble());
   var lifted=new ClientPositionValidator.Pose(a.x(),b.y(),a.z());var across=new ClientPositionValidator.Pose(b.x(),a.y(),b.z());var g=new PositionCollision(scene,space);
   var m=scene.data.path("movement");var capsule=new com.jme3.bullet.collision.shapes.CapsuleCollisionShape((float)m.path("radius").asDouble(),(float)m.path("halfHeight").asDouble()*2,1);
   var start=new com.jme3.math.Vector3f((float)a.x(),(float)a.y(),(float)a.z());var end=new com.jme3.math.Vector3f((float)b.x(),(float)b.y(),(float)b.z());var hits=new ArrayList<Map<String,Object>>();
   for(var h:space.sweepTest(capsule,new com.jme3.math.Transform(start),new com.jme3.math.Transform(end)))if(h.getCollisionObject().getCollisionGroup()==2)hits.add(Map.of("id",h.getCollisionObject().getUserObject(),"fraction",h.getHitFraction(),"normal",h.getHitNormalLocal(null)));
   return Map.of("verticalFirst",g.clear(a,lifted,false)&&g.clear(lifted,b,false),"horizontalFirst",g.clear(a,across,false)&&g.clear(across,b,false),"startSupported",g.supported(a),"endSupported",g.supported(b),"hits",hits);
  }finally{space.destroy();}
 }}