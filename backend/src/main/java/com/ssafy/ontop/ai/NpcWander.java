package com.ssafy.ontop.ai;

import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import java.util.*;
import java.util.random.RandomGenerator;

/** Stable random destinations, real pauses and acceleration. All navigation runs on the owning NPC worker. */
public final class NpcWander {
    public interface Navigation {
        List<Point> path(Point from,Point to);
        Point destination(Point from,RandomGenerator random);
    }
    public record View(Point point,double yaw,boolean moving,NpcUtility.Decision decision) { }
    private final Navigation nav;private final RandomGenerator random;private final double maxSpeed;
    private Point point,goal;private List<Point> path=List.of();private int next;
    private long restUntil,planAfter,walkUntil;private boolean travelling,wasWatching;private double speed,yaw;
    public NpcWander(Point start,Navigation nav,RandomGenerator random,double maxSpeed) {
        point=start;this.nav=nav;this.random=random;this.maxSpeed=maxSpeed;
    }
    public boolean resting(long now){return now<restUntil;}
    public void relocate(Point at){point=at;goal=null;path=List.of();next=0;speed=0;restUntil=0;planAfter=0;travelling=false;}
    public View tick(long now,double dt,Point focus) {
        boolean watch=focus!=null;
        if(!watch && (wasWatching || travelling && (next>=path.size()||now>=walkUntil))) {
            restUntil=now+random.nextLong(4000,11001);travelling=false;path=List.of();next=0;
        }
        wasWatching=watch;
        var decision=NpcUtility.choose(false,false,watch,resting(now));
        if(decision.action().equals("REST")){speed=0;return new View(point,yaw,false,decision);}
        if(watch && goal!=null && goal.distance(focus)>1){path=List.of();next=0;goal=null;planAfter=0;}
        boolean atFocus=watch && goal!=null && next>=path.size() && point.distance(focus)<=3;
        if(next>=path.size() && now>=planAfter && !atFocus) {
            goal=watch?focus:nav.destination(point,random);
            path=goal==null?List.of():List.copyOf(nav.path(point,goal));next=0;
            while(next<path.size()&&point.distance(path.get(next))<.02)next++;
            planAfter=now+1500;
            travelling=!watch&&next<path.size();
            if(travelling)walkUntil=now+random.nextLong(8000,18001);
            if(!watch && next>=path.size()){restUntil=now+random.nextLong(1800,3501);return new View(point,yaw,false,NpcUtility.choose(false,false,false,true));}
        }
        double remaining=0;Point before=point;
        for(int i=next;i<path.size();i++){remaining+=before.distance(path.get(i));before=path.get(i);}
        dt=Math.max(0,Math.min(.2,dt));
        double acceleration=watch?4.5:2.2;
        double desired=Math.min(watch?4.5:maxSpeed,Math.sqrt(2*acceleration*remaining));
        speed+=Math.max(-acceleration*dt,Math.min(acceleration*dt,desired-speed));
        double budget=speed*dt;boolean moving=false;
        while(next<path.size() && budget>0) {
            var target=path.get(next);double distance=point.distance(target);
            if(distance<.001){next++;continue;}
            double step=Math.min(budget,distance),a=step/distance;
            yaw=Math.atan2(target.x()-point.x(),target.z()-point.z());
            point=new Point(point.x()+(target.x()-point.x())*a,point.y()+(target.y()-point.y())*a,point.z()+(target.z()-point.z())*a);
            budget-=step;moving=true;if(step==distance)next++;
        }
        if(!moving)speed=0;
        return new View(point,yaw,moving,decision);
    }
}
