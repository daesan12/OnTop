package com.ssafy.ontop.ai;

import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class PolicePatrolTests {
    private final PolicePatrol.Navigation navigation=new PolicePatrol.Navigation() {
        public Point spawn() { return new Point(0,.8,0); }
        public List<Point> path(Point a,Point b) { return List.of(a,b); }
    };
    @Test void patrolRunsToUserSpeaksAfterArrivalAndResumes() {
        var police=new PolicePatrol(navigation); var arrived=new AtomicInteger();var notices=new ArrayList<String>();
        var actors=Map.of("101",new Point(15,.8,0));
        var walking=police.tick(0,.25,actors);
        assertThat(walking.action()).isEqualTo("PATROL"); assertThat(walking.moving()).isTrue();
        police.incident(new PolicePatrol.Incident("i","101","안내",p -> arrived.incrementAndGet(),notices::add));
        var running=police.tick(250,.25,actors);
        assertThat(running.action()).isEqualTo("RESPOND"); assertThat(arrived.get()).isZero();
        assertThat(Math.hypot(running.x()-walking.x(),running.z()-walking.z())).isCloseTo(2.0,org.assertj.core.data.Offset.offset(.001));
        for(int i=2;i<40 && arrived.get()==0;i++) police.tick(i*250,.25,actors);
        assertThat(arrived.get()).isEqualTo(1);
        assertThat(notices).containsExactly("");
        assertThat(walking.name()).isEqualTo("한순경");
        assertThat(police.tick(20_000,.25,actors).action()).isEqualTo("PATROL");
    }
    @Test void aerialWarningWalksOrJumpsDownWithoutASecondTeleport() {
        var arrived=new AtomicInteger(); var notices=new ArrayList<String>();
        var police=new PolicePatrol(new PolicePatrol.Navigation() {
            public Point spawn() { return new Point(0,.8,0); }
            public List<Point> path(Point a,Point b) { return List.of(); }
            public boolean requiresTeleport(String actor,Point p) { return true; }
            public boolean canPatrolFrom(Point p) { return p.y()<1; }
            public List<com.ssafy.ontop.world.movement.NpcDescent.Step> returnPath(Point p) {
                return List.of(new com.ssafy.ontop.world.movement.NpcDescent.Step(new Point(p.x()+2,8,0),1,true),
                        new com.ssafy.ontop.world.movement.NpcDescent.Step(new Point(p.x()+4,.8,0),1,false));
            }
            public Point warningPoint(Point p) { return new Point(p.x()+1,p.y(),p.z()); }
        });
        police.incident(new PolicePatrol.Incident("i","101","안내",p -> arrived.incrementAndGet(),notices::add));
        var actors=Map.of("101",new Point(20,15,0));
        assertThat(police.tick(0,.25,actors).action()).isEqualTo("WAITING_PATH");
        assertThat(police.tick(4999,.25,actors).x()).isZero(); assertThat(arrived.get()).isZero();
        var warning=police.tick(5000,.25,actors);
        assertThat(warning.action()).isEqualTo("TELEPORT_WARNING"); assertThat(warning.x()).isEqualTo(21);
        assertThat(warning.warp()).isEqualTo(1); assertThat(arrived.get()).isEqualTo(1);
        var returning=police.tick(8000,.25,actors);
        assertThat(returning.action()).isEqualTo("RETURN_JUMP");assertThat(returning.x()).isGreaterThan(21);
        assertThat(returning.warp()).isEqualTo(1);
        for(int i=1;i<9;i++)police.tick(8000+i*250,.25,actors);
        var returned=police.tick(10500,.25,actors);
        assertThat(returned.action()).isIn("PATROL","REST");assertThat(returned.warp()).isEqualTo(1);
        assertThat(notices.getLast()).isEmpty();
    }
    @Test void missingDescentRouteWaitsAndRetriesWithoutWarpingOrServingTwoPlacesAtOnce() {
        var available=new java.util.concurrent.atomic.AtomicBoolean();var arrivals=new AtomicInteger();
        var police=new PolicePatrol(new PolicePatrol.Navigation() {
            public Point spawn(){return new Point(0,.8,0);}
            public List<Point> path(Point a,Point b){return List.of();}
            public boolean requiresTeleport(String actor,Point p){return p.y()>1;}
            public boolean canPatrolFrom(Point p){return p.y()<1;}
            public List<com.ssafy.ontop.world.movement.NpcDescent.Step> returnPath(Point p){return available.get()?List.of(new com.ssafy.ontop.world.movement.NpcDescent.Step(new Point(p.x(),.8,p.z()),1,true)):List.of();}
        });
        var actors=Map.of("A",new Point(20,10,0),"B",new Point(20,.8,0));
        police.incident(new PolicePatrol.Incident("high","A","안내",p->arrivals.incrementAndGet()));
        police.tick(0,.25,actors);police.tick(5000,.25,actors);
        police.incident(new PolicePatrol.Incident("next","B","안내",p->arrivals.incrementAndGet()));
        var waiting=police.tick(8000,.25,actors);assertThat(waiting.action()).isEqualTo("RETURN_WAIT");
        assertThat(waiting.warp()).isEqualTo(1);assertThat(arrivals).hasValue(1);
        available.set(true);for(int i=0;i<20;i++)police.tick(10000+i*250,.25,actors);
        assertThat(arrivals).hasValue(2);assertThat(police.tick(16000,.25,actors).warp()).isEqualTo(1);
    }
    @Test void aBriefJumpUsesTheGroundApproachAndLandingCancelsTeleport() {
        var notices=new ArrayList<String>();var arrived=new AtomicInteger();
        var police=new PolicePatrol(new PolicePatrol.Navigation() {
            public Point spawn(){return new Point(0,.8,0);}
            public List<Point> path(Point a,Point b){return List.of(a,b);}
            public Point approachPoint(Point p){return new Point(p.x(),.8,p.z());}
            public boolean requiresTeleport(String actor,Point p){return p.y()>1.15;}
        });
        police.incident(new PolicePatrol.Incident("jump","A","안내",p->arrived.incrementAndGet(),notices::add));
        var airborne=Map.of("A",new Point(15,2.5,0));
        var running=police.tick(0,.25,airborne);
        assertThat(running.action()).isEqualTo("RESPOND");assertThat(running.y()).isZero();assertThat(running.moving()).isTrue();
        police.tick(4999,.25,Map.of("A",new Point(15,.8,0)));
        assertThat(police.tick(5000,.25,airborne).warp()).isZero();
        for(int i=1;i<=8;i++)police.tick(5000+i*250,.25,Map.of("A",new Point(15,.8,0)));
        assertThat(arrived).hasValue(1);assertThat(notices).containsExactly("");
    }
    @Test void groundTeleportResumesWalkingHereInsteadOfWarpingBack() {
        var police=new PolicePatrol(new PolicePatrol.Navigation() {
            public Point spawn(){return new Point(0,.8,0);}
            public List<Point> path(Point a,Point b){return a.x()<10?List.of():List.of(a,b);}
            public Point warningPoint(Point p){return new Point(p.x()+1,.8,p.z());}
        });
        var actors=Map.of("A",new Point(15,.8,0));
        police.incident(new PolicePatrol.Incident("ground","A","안내",p->{}));
        police.tick(0,.25,actors);var warning=police.tick(5000,.25,actors);
        assertThat(warning.action()).isEqualTo("TELEPORT_WARNING");assertThat(warning.warp()).isEqualTo(1);
        var resumed=police.tick(8000,.25,actors);
        assertThat(resumed.x()).isEqualTo(16);assertThat(resumed.warp()).isEqualTo(1);
        var walking=police.tick(8250,.25,actors);
        assertThat(walking.action()).isEqualTo("PATROL");assertThat(walking.moving()).isTrue();assertThat(walking.warp()).isEqualTo(1);
    }
    @Test void aPathThatRecoversBeforeFiveSecondsDoesNotTeleport() {
        var available=new java.util.concurrent.atomic.AtomicBoolean();
        var police=new PolicePatrol(new PolicePatrol.Navigation() {
            public Point spawn(){return new Point(0,.8,0);}
            public List<Point> path(Point a,Point b){return available.get()?List.of(a,b):List.of();}
        });
        var actors=Map.of("A",new Point(20,.8,0));
        police.incident(new PolicePatrol.Incident("route","A","안내",p->{}));
        police.tick(0,.25,actors);available.set(true);
        assertThat(police.tick(5000,.25,actors).action()).isEqualTo("RESPOND");
        assertThat(police.tick(6000,.25,actors).warp()).isZero();
    }
    @Test void aStillDistantGroundUserGetsOneTeleportAndThenLocalPatrol() {
        var police=new PolicePatrol(navigation);var arrived=new AtomicInteger();
        var actors=Map.of("A",new Point(150,.8,0));
        police.incident(new PolicePatrol.Incident("far","A","안내",p->arrived.incrementAndGet()));
        for(int i=0;i<20;i++)assertThat(police.tick(i*250,.25,actors).warp()).isZero();
        assertThat(police.tick(5000,.25,actors).warp()).isEqualTo(1);assertThat(arrived).hasValue(1);
        var after=police.tick(8000,.25,actors);assertThat(after.warp()).isEqualTo(1);assertThat(after.x()).isEqualTo(150);
    }
    @Test void failedGroundRouteUsesTeleportAndDisconnectCancelsBeforeTeleport() {
        var police=new PolicePatrol(new PolicePatrol.Navigation() {
            public Point spawn() { return new Point(0,.8,0); }
            public List<Point> path(Point a,Point b) { return List.of(); }
        });
        var arrived=new AtomicInteger();
        police.incident(new PolicePatrol.Incident("i","101","안내",p -> arrived.incrementAndGet()));
        var actors=Map.of("101",new Point(15,.8,0));
        police.tick(0,.25,actors);
        assertThat(police.tick(5000,.25,actors).action()).isEqualTo("TELEPORT_WARNING");
        assertThat(arrived.get()).isEqualTo(1);
        var cancelled=new PolicePatrol(navigation);
        cancelled.incident(new PolicePatrol.Incident("i","101","안내",p -> { throw new AssertionError("disconnected"); }));
        assertThat(cancelled.tick(0,.25,Map.of()).action()).isEqualTo("PATROL");
    }
    @Test void freshWarningsAreQueuedEvenForSameActorAndRetryIsDeduplicated() {
        var police=new PolicePatrol(navigation); var warned=new ArrayList<String>();
        police.incident(new PolicePatrol.Incident("one","A","안내",p -> warned.add("one")));
        police.incident(new PolicePatrol.Incident("one","A","중복",p -> warned.add("duplicate")));
        police.incident(new PolicePatrol.Incident("two","A","안내",p -> warned.add("two")));
        var actors=Map.of("A",new Point(1,.8,0));
        police.tick(0,.25,actors); police.tick(6001,.25,actors);
        assertThat(warned).containsExactly("one","two");
    }
}
