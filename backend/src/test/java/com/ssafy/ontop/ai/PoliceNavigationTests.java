package com.ssafy.ontop.ai;

import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.movement.ParkNavigation;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PoliceNavigationTests {
    @Test void actualTowerAndJumpmapCanReturnByCollisionCheckedWalkingJumpingAndFalling() throws Exception {
        var map=PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1"));
        var course=com.ssafy.ontop.world.jumpmap.JumpCourse.loadDefault();
        var positions=new java.util.ArrayList<ParkNavigation.Point>();double highest=-1;
        for(var mesh:map.collisionData().path("meshes"))if(mesh.path("id").asText().equals("tower-deck")) {
            var v=mesh.path("vertices");var indices=mesh.path("indices");
            for(int i=0;i+2<indices.size();i+=3) {
                int a=indices.get(i).asInt()*3,b=indices.get(i+1).asInt()*3,c=indices.get(i+2).asInt()*3;
                double y=v.get(a+1).asDouble();
                double area=Math.abs((v.get(b).asDouble()-v.get(a).asDouble())*(v.get(c+2).asDouble()-v.get(a+2).asDouble())-(v.get(c).asDouble()-v.get(a).asDouble())*(v.get(b+2).asDouble()-v.get(a+2).asDouble()));
                if(y>highest&&Math.abs(y-v.get(b+1).asDouble())<.001&&Math.abs(y-v.get(c+1).asDouble())<.001&&area>1){highest=y;positions.clear();positions.add(new ParkNavigation.Point((v.get(a).asDouble()+v.get(b).asDouble()+v.get(c).asDouble())/3,y+.8,(v.get(a+2).asDouble()+v.get(b+2).asDouble()+v.get(c+2).asDouble())/3));}
            }
        }
        assertThat(positions).hasSize(1);
        for(var pad:course.colliders().stream().filter(p->p.top()>4).limit(3).toList())positions.add(new ParkNavigation.Point(pad.x(),pad.top()+.8,pad.z()));
        try(var nav=new ParkNavigation(map.createScene(),course)) {
            for(var point:positions) {
                var warning=nav.warningPoint(point);assertThat(warning).isNotNull();
                long start=System.nanoTime();var steps=nav.returnToGround(warning);
                System.out.println("NPC descent "+point+" steps="+steps.size()+" planMs="+(System.nanoTime()-start)/1_000_000.0);
                assertThat(steps).as("descent from %s",point).isNotEmpty();
                var previous=warning;
                for(var step:steps){assertThat(step.seconds()).isPositive();assertThat(nav.traversalClear(previous,step.point())).isTrue();previous=step.point();}
                assertThat(steps).anyMatch(com.ssafy.ontop.world.movement.NpcDescent.Step::airborne);
                var landed=steps.getLast().point();assertThat(nav.path(landed,landed)).isNotEmpty();
                assertThat(landed.y()).isCloseTo(nav.groundPoint(landed.x(),landed.z()).y(),org.assertj.core.data.Offset.offset(.1));
            }
        }
    }
    @Test void randomGoalsRespectDistinctPoliceAndPlazaAreas() throws Exception {
        var map=PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1"));
        try(var nav=new ParkNavigation(map.createScene())) {
            var plaza=nav.plazaTables();var start=nav.spawn(plaza);assertThat(plaza.contains(start)).isTrue();
            var random=new java.util.Random(19);var elder=new java.util.HashSet<ParkNavigation.Point>();var police=new java.util.HashSet<ParkNavigation.Point>();
            for(int i=0;i<30;i++) {
                var a=nav.randomDestination(start,plaza,random);if(a!=null){assertThat(plaza.contains(a)).isTrue();elder.add(a);}
                var b=nav.randomDestination(start,nav.wholePark(),random);if(b!=null){assertThat(nav.wholePark().contains(b)).isTrue();police.add(b);}
            }
            assertThat(elder.size()).isGreaterThan(8);assertThat(police.stream().anyMatch(p -> !plaza.contains(p))).isTrue();
        }
    }
    @Test void actualGeneratedParkHasCollisionCheckedPatrolAndMailboxApproach() throws Exception {
        var map=PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"),Set.of("channel-1"));
        var course=com.ssafy.ontop.world.jumpmap.JumpCourse.loadDefault();
        try(var nav=new ParkNavigation(map.createScene(),course)) {
            var spawn=nav.spawn();
            var patrol=nav.path(spawn,new ParkNavigation.Point(spawn.x(),spawn.y(),spawn.z()-12));
            assertThat(patrol).hasSizeBetween(2,6); // Open walkway is no longer emitted as eleven 1m turns.
            for(int i=1;i<patrol.size();i++) assertThat(nav.lineClear(patrol.get(i-1),patrol.get(i))).isTrue();
            var moving=new ParkNavigation.Point((patrol.get(0).x()+patrol.get(1).x())/2,
                    (patrol.get(0).y()+patrol.get(1).y())/2,(patrol.get(0).z()+patrol.get(1).z())/2);
            assertThat(nav.path(moving,patrol.getLast())).isNotEmpty();
            var box=map.feedback().center();
            var approach=nav.path(spawn,new ParkNavigation.Point(box.x(),box.y(),box.z()));
            assertThat(approach).isNotEmpty();
            var pad=course.colliders().stream().filter(c -> c.top()>4).findFirst().orElseThrow();
            var target=new ParkNavigation.Point(pad.x(),pad.top()+.8,pad.z());
            assertThat(nav.warningPoint(target)).isNotNull();
        }
    }
}
