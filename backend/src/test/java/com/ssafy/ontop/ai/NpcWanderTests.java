package com.ssafy.ontop.ai;
import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class NpcWanderTests {
    @Test void utilitiesPrioritizeWorkOverRestAndRandomPatrol() {
        assertThat(NpcUtility.choose(true,true,true,true).action()).isEqualTo("RESPOND");
        assertThat(NpcUtility.choose(false,true,true,true).action()).isEqualTo("PLAY_OMOK");
        assertThat(NpcUtility.choose(false,false,true,true).action()).isEqualTo("WATCH_OMOK");
        assertThat(NpcUtility.choose(false,false,false,true).action()).isEqualTo("REST");
    }
    @Test void destinationIsStableWhileWalkingAndArrivalHasRealRest() {
        var goals=new ArrayList<Point>();
        var w=new NpcWander(new Point(0,.8,0),new NpcWander.Navigation(){
            public List<Point> path(Point a,Point b){return List.of(a,b);}
            public Point destination(Point from,java.util.random.RandomGenerator r){var p=new Point(from.x()+4,from.y(),from.z()+r.nextDouble(-1,1));goals.add(p);return p;}
        },new Random(7),1.4);
        var first=w.tick(0,.1,null);assertThat(first.point().distance(new Point(0,.8,0))).isLessThan(.04);
        NpcWander.View rest=null;long now=100;
        for(;now<10_000;now+=100){var v=w.tick(now,.1,null);if(v.decision().action().equals("REST")){rest=v;break;}}
        assertThat(rest).isNotNull();assertThat(goals).hasSize(1);
        var still=w.tick(now+1000,.1,null);assertThat(still.point()).isEqualTo(rest.point());assertThat(still.moving()).isFalse();
        var watch=w.tick(now+1100,.1,new Point(-10,.8,0));assertThat(watch.decision().action()).isEqualTo("WATCH_OMOK");assertThat(watch.moving()).isTrue();
    }
}
