package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.*;
import static org.assertj.core.api.Assertions.*;
import static org.assertj.core.data.Offset.offset;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RenewalCourseMotionTests {
    private JumpCourse course;
    private ParkScene scene;
    @BeforeAll
    void setup() throws Exception {
        course=JumpCourse.load(Path.of("../frontend/generated/park-renewal/course.local.json"),Path.of("../frontend/generated/park-renewal/course.local.sha256"));
        scene=PreparedParkMap.loadRenewal(Path.of("../frontend/generated/park-renewal/server-map.local.json"),Path.of("../frontend/generated/park-renewal/server-manifest.local.json"),Set.of("channel-1")).createScene();
    }

    @Test
    void 개인별_시작과_연잎_두더지_비둘기_충돌체가_화면과_같이_동작한다() {
        var space=new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            var bodies=JumpCourseColliders.addTo(space,course);
            var motion=new RenewalCourseMotion(course,bodies,space);
            int leaf=block("lily"),mole=block("mole"),bird=block("pigeon"),duck=block("duck");
            motion.prepare("101",0);
            assertThat(space.getRigidBodyList()).hasSize(1);
            motion.run("101","run");motion.prepare("101",0);
            assertThat(space.getRigidBodyList()).hasSize(178);
            motion.contact("101",course.colliders().get(leaf),0);
            motion.prepare("101",2.99);assertThat(motion.pose("101",leaf,2.99).solid()).isTrue();
            motion.prepare("101",3);assertThat(motion.pose("101",leaf,3).solid()).isFalse();
            assertThat(space.getRigidBodyList()).doesNotContain(bodies.get(leaf));
            motion.contact("101",null,3);motion.prepare("101",7.01);
            assertThat(motion.pose("101",leaf,7.01).solid()).isTrue();
            motion.contact("101",course.colliders().get(mole),10);
            assertThat(motion.pose("101",mole,10.475).offset()).isCloseTo(-.48,offset(1e-8));
            assertThat(motion.pose("101",mole,10.96).offset()).isZero();
            assertThat(motion.pose("101",bird,.95).offset()).isCloseTo(.42,offset(1e-8));
            assertThat(motion.pose("101",duck,11).offset()).isZero();
            motion.prepare("202",11);assertThat(space.getRigidBodyList()).hasSize(1);
            motion.prepare("101",11);assertThat(space.getRigidBodyList()).hasSize(178);
            motion.run("101",null);motion.prepare("101",12);assertThat(space.getRigidBodyList()).hasSize(1);
        } finally {space.destroy();}
    }

    @Test
    void 개인별_서버물리도_시작전에는_첫발판만_지지한다() {
        long[] now={0};var pad=course.colliders().get(5);
        try(var physics=new WorldPhysics(scene,false,()->now[0],true,course)) {
            physics.add("101");physics.add("202");
            physics.jumpmapRun("101","run");
            physics.place("101",pad.x(),pad.top()+.8,pad.z());
            physics.place("202",pad.x(),pad.top()+.8,pad.z());
            for(int i=0;i<20;i++){now[0]+=WorldPhysics.STEP_NANOS;physics.step(now[0],Set.of());}
            assertThat(physics.support("101").course()).isEqualTo(pad);
            assertThat(physics.support("202").course()).isNull();
            assertThat(physics.snapshot("202").y()).isLessThan(pad.top()-.5);
        }
    }

    private int block(String theme) {return course.colliders().stream().filter(p->course.theme(p.block()).equals(theme)).findFirst().orElseThrow().block();}

    @Test
    void 마흔명의_코스_미진입자와_같은_발판_상태는_각각_한_스텝만_계산한다() {
        long[] now = {0};
        try (var physics = new WorldPhysics(scene, false, () -> now[0], true, course)) {
            for (int player = 0; player < 40; player++) {
                physics.add("load-" + player);
            }
            for (int tick = 0; tick < 30; tick++) {
                physics.step(now[0] += WorldPhysics.STEP_NANOS, Set.of());
                assertThat(physics.lastSimulationSteps()).isEqualTo(1);
            }
            for (int player = 0; player < 40; player++) {
                physics.jumpmapRun("load-" + player, "run-" + player);
            }
            for (int tick = 0; tick < 30; tick++) {
                physics.step(now[0] += WorldPhysics.STEP_NANOS, Set.of());
                assertThat(physics.lastSimulationSteps()).isEqualTo(1);
            }
            physics.jumpmapRun("load-0", null);
            physics.step(now[0] += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.lastSimulationSteps()).isEqualTo(2);
        }
    }

    @Test
    void 두더지_개인_높이가_다를_때만_충돌_스텝을_분리하고_시간을_중복_진행하지_않는다() {
        long[] now = {0};
        var pad = course.colliders().get(block("mole"));
        try (var physics = new WorldPhysics(scene, false, () -> now[0], true, course)) {
            for (String id : new String[] {"101", "202", "303"}) {
                physics.add(id);
                physics.jumpmapRun(id, "run-" + id);
                physics.place(id, pad.x(), pad.top() + .8, pad.z());
            }
            physics.observe("101");
            now[0] += 400_000_000L;
            for (int tick = 0; tick < 8; tick++) {
                physics.step(now[0] += WorldPhysics.STEP_NANOS, Set.of());
            }

            assertThat(physics.lastSimulationSteps()).isEqualTo(2);
            assertThat(physics.snapshot("202").y()).isCloseTo(physics.snapshot("303").y(), offset(.0001));
            assertThat(physics.snapshot("202").y()).isGreaterThan(pad.top() + .7);
            assertThat(physics.snapshot("101").y()).isLessThan(physics.snapshot("202").y());
        }
    }

    @Test
    void 비둘기가_기준높이_위아래로_움직여도_실제_충돌쿼리가_지지면을_찾는다() {
        var space=new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            var motion=new RenewalCourseMotion(course,JumpCourseColliders.addTo(space,course),space);
            var geometry=new PositionCollision(scene,space);
            int index=block("pigeon");var pad=course.colliders().get(index);
            motion.run("101","run");
            for(double time:new double[]{.95,2.85,4.75,.95}) {
                motion.prepare("101",time);
                var feet=pad.top()+motion.pose("101",index,time).offset();
                var pose=new ClientPositionValidator.Pose(pad.x(),feet+.8,pad.z());
                assertThat(geometry.supported(pose)).as("time=%s feet=%s",time,feet).isTrue();
                assertThat(geometry.clear(pose,pose,false)).as("time=%s",time).isTrue();
            }
        } finally {space.destroy();}
    }

    @Test
    void 두더지에_서있는_위치보고는_내려갔다_올라오는_동안_막히지_않는다() {
        long[] now={0};var pad=course.colliders().get(block("mole"));
        try(var physics=new WorldPhysics(scene,true,()->now[0],true,course)) {
            physics.add("101");physics.jumpmapRun("101","run");
            physics.place("101",pad.x(),pad.top()+.8,pad.z());
            physics.observe("101");
            var before=physics.snapshot("101");
            for(int i=1;i<=24;i++) {
                now[0]=i*50_000_000L;
                double t=i*.05/.95;
                double dip=t<=1?-.48*Math.pow(Math.sin(Math.PI*t),2):0;
                var path=new java.util.ArrayList<ClientPositionValidator.Sample>();
                for(int frame=1;frame<=3;frame++) {
                    double age=((i-1)*.05+frame/60d)/.95;
                    double offsetY=age<=1?-.48*Math.pow(Math.sin(Math.PI*age),2):0;
                    path.add(new ClientPositionValidator.Sample(new ClientPositionValidator.Pose(
                            pad.x(),pad.top()+offsetY+.8,pad.z()),false));
                }
                var reported=physics.report("101",new ClientPositionValidator.Candidate(i,before.motion().epoch(),
                        path.getLast().pose(),false,false,0,true,path),now[0]);
                assertThat(reported.motion().correctionReason()).as("tick=%s",i).isNull();
                assertThat(reported.y()).isCloseTo(pad.top()+dip+.8,offset(.005));
                physics.observe("101");before=reported;
            }
        }
    }

    @Test
    void 완주_목표_호수섬이_실제_서버_충돌에서도_접지면으로_판정된다() {
        long[] now={0};var finish=course.finish();
        try(var physics=new WorldPhysics(scene,false,()->now[0],true,course)) {
            physics.add("101");physics.jumpmapRun("101","run");
            physics.place("101",finish.x(),finish.y()+1.1,finish.z());
            for(int i=0;i<45;i++){now[0]+=WorldPhysics.STEP_NANOS;physics.step(now[0],Set.of());}
            var observation=physics.observe("101");
            assertThat(observation.swimming()).isFalse();
            assertThat(observation.support().kind()).isEqualTo(WorldPhysics.Support.Kind.TERRAIN);
            assertThat(course.atFinish(observation.x(),observation.z())).isTrue();
        }
    }
}
