package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import java.util.*;

/** Bounded local surface search. Every walking chord and ballistic sample uses the NPC capsule. */
public final class NpcDescent {
    public record Step(Point point,double seconds,boolean airborne) { }
    public interface Geometry {
        Point surfaceBelow(Point above);
        boolean supported(Point point);
        boolean clear(Point from,Point to);
        boolean groundExit(Point point);
        double gravity();
        double jumpSpeed(Point point);
    }
    private record Node(Point point,List<Step> route,double cost) { }
    private final Geometry geometry;
    public NpcDescent(Geometry geometry){this.geometry=geometry;}
    public List<Step> find(Point from) {
        Point support=geometry.surfaceBelow(from);
        if(support==null)return List.of();
        var initial=from.distance(support)<.03?List.<Step>of():flight(from,support,0);
        if(from.distance(support)>=.03&&initial.isEmpty())return List.of();
        var open=new PriorityQueue<Node>(Comparator.comparingDouble(n->n.cost()+n.point().y()*2));
        open.add(new Node(support,initial,seconds(initial)));
        var visited=new HashSet<String>();
        int expanded=0;
        while(!open.isEmpty()&&expanded<384) {
            var node=open.remove();Point at=node.point();
            String key=Math.round(at.x()*2)+":"+Math.round(at.y()*10)+":"+Math.round(at.z()*2);
            if(!visited.add(key))continue;
            expanded++;
            if(geometry.groundExit(at))return node.route();
            for(int radius:new int[]{1,3,6})for(int dx=-1;dx<=1;dx++)for(int dz=-1;dz<=1;dz++) {
                if(dx==0&&dz==0)continue;
                double x=at.x()+dx*radius,z=at.z()+dz*radius;
                if(Math.hypot(x-from.x(),z-from.z())>32)continue;
                double jump=geometry.jumpSpeed(at),rise=jump*jump/(2*geometry.gravity());
                Point next=geometry.surfaceBelow(new Point(x,at.y()+Math.max(.22,rise),z));
                if(next==null||next.distance(at)<.1)continue;
                var edge=radius==1?walk(at,next):List.<Step>of();
                if(edge.isEmpty())edge=flight(at,next,jump);
                if(edge.isEmpty())continue;
                var route=new ArrayList<Step>(node.route());route.addAll(edge);
                open.add(new Node(next,List.copyOf(route),node.cost()+seconds(edge)));
            }
        }
        return List.of();
    }
    private List<Step> walk(Point from,Point to) {
        if(Math.abs(from.y()-to.y())>.22)return List.of();
        int count=Math.max(1,(int)Math.ceil(from.distance(to)/.2));Point previous=from;
        for(int i=1;i<=count;i++) {
            Point next=lerp(from,to,(double)i/count);
            if(!geometry.supported(next)||!geometry.clear(previous,next))return List.of();
            previous=next;
        }
        return List.of(new Step(to,from.distance(to)/2.4,false));
    }
    private List<Step> flight(Point from,Point to,double velocity) {
        double gravity=geometry.gravity(),discriminant=velocity*velocity+2*gravity*(from.y()-to.y());
        if(discriminant<0)return List.of();
        double duration=(velocity+Math.sqrt(discriminant))/gravity;
        if(duration<.01||duration>12||Math.hypot(to.x()-from.x(),to.z()-from.z())/duration>6)return List.of();
        int count=Math.max(1,(int)Math.ceil(duration/.05));double dt=duration/count;
        var result=new ArrayList<Step>();Point previous=from;
        for(int i=1;i<=count;i++) {
            double time=i*dt,t=time/duration;
            Point next=i==count?to:new Point(from.x()+(to.x()-from.x())*t,
                    from.y()+velocity*time-gravity*time*time/2,from.z()+(to.z()-from.z())*t);
            if(!geometry.clear(previous,next))return List.of();
            result.add(new Step(next,dt,i<count));previous=next;
        }
        return geometry.supported(to)?List.copyOf(result):List.of();
    }
    private static double seconds(List<Step> steps){return steps.stream().mapToDouble(Step::seconds).sum();}
    private static Point lerp(Point a,Point b,double t){return new Point(a.x()+(b.x()-a.x())*t,a.y()+(b.y()-a.y())*t,a.z()+(b.z()-a.z())*t);}
}
