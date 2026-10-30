package com.ssafy.ontop.world.movement;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.CapsuleCollisionShape;
import com.jme3.bullet.objects.PhysicsGhostObject;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import com.jme3.math.Transform;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
class TunedStairGeometryTests {
 @Test void 실제_계단_침투좌표는_거절하고_발판위_좌표는_통과한다()throws Exception{
  var scene=PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1")).createScene();
  var space=new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
  try{
   for(var shape:scene.shapes){if(shape.id().matches(".+-chair-[23]"))continue;var body=new PhysicsRigidBody(shape.shape(),0);body.setPhysicsLocation(shape.center());body.setPhysicsRotation(shape.rotation());body.setCollisionGroup(2);body.setCollideWithGroups(1);body.setUserObject(shape.id());space.addCollisionObject(body);}
   var from=new ClientPositionValidator.Pose(-.0001578014053,1.1366242170,17.8517913818);
   var to=new ClientPositionValidator.Pose(-.0002000213281,1.1629134417,17.5201282501);
   var collision=new PositionCollision(scene,space);
   System.out.println("STAIR_SUPPORT from="+collision.supported(from)+" to="+collision.supported(to)+" clear="+collision.clear(from,to,true));
   var capsule=new CapsuleCollisionShape(.3f,.96f,1);var probe=new PhysicsGhostObject(capsule);probe.setCollisionGroup(1);probe.setCollideWithGroups(2);probe.setPhysicsLocation(new Vector3f((float)to.x(),(float)to.y(),(float)to.z()));
   space.contactTest(probe,event->{var other=event.getObjectA()==probe?event.getObjectB():event.getObjectA();if(event.getDistance1()<-.001)System.out.println("STAIR_OVERLAP id="+other.getUserObject()+" distance="+event.getDistance1());});
   var a=new Vector3f((float)from.x(),(float)from.y(),(float)from.z());
   var b=new Vector3f((float)to.x(),(float)to.y(),(float)to.z());
   for(var v:space.sweepTest(capsule,new Transform(a.add(0,.22f,0)),new Transform(b.add(0,.22f,0))))System.out.println("STAIR_SWEEP id="+v.getCollisionObject().getUserObject()+" fraction="+v.getHitFraction()+" normal="+v.getHitNormalLocal(null));
   assertThat(collision.clear(from,to,true)).isFalse();
   var corrected=new ClientPositionValidator.Pose(to.x(),1.3,to.z());
   assertThat(collision.clear(from,corrected,true)).isTrue();
  }finally{space.destroy();}
 }
}
