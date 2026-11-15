package com.ssafy.ontop.ai;

import com.ssafy.ontop.world.movement.ParkNavigation.Point;
import com.ssafy.ontop.world.movement.NpcDescent.Step;
import java.util.*;
import java.util.function.Consumer;

/** One physical actor: patrol, approach, delayed teleport warning when inaccessible, return. */
public final class PolicePatrol {
    private final AiMetrics metrics=new AiMetrics();
    public Map<String,Long> metrics(){return metrics.snapshot();}
    public interface Navigation {
        Point spawn(); List<Point> path(Point from,Point to);
        default boolean lineClear(Point a,Point b) { return true; }
        default boolean requiresTeleport(String actor,Point target) { return false; }
        default Point approachPoint(Point target) { return target; }
        default boolean canPatrolFrom(Point point) { return true; }
        default List<Step> returnPath(Point point) { return List.of(); }
        default Point warningPoint(Point actor) { return actor; }
        default Point patrolDestination(Point from,java.util.random.RandomGenerator random) {
            double angle=random.nextDouble()*Math.PI*2;return new Point(from.x()+Math.cos(angle)*12,from.y(),from.z()+Math.sin(angle)*12);
        }
    }
    public record Incident(String id,String actor,String speech,Consumer<Point> arrived,Consumer<String> privateNotice) {
        public Incident(String id,String actor,String speech,Consumer<Point> arrived) { this(id,actor,speech,arrived,ignored -> { }); }
    }
    public record View(String id,String name,String action,double x,double y,double z,double yaw,boolean moving,long warp,NpcAmbient.Bubble ambient) { }
    private final NpcAmbient ambient=new NpcAmbient();
    private long tickAt;
    private final Navigation navigation;
    private final ArrayDeque<Incident> pending=new ArrayDeque<>();
    private static final int ACCEPTED_HISTORY_LIMIT=64;
    private final LinkedHashSet<String> accepted=new LinkedHashSet<>();
    private final NpcWander wander;
    private Point position;
    private List<Step> recovery=List.of();
    private int recoveryNext;
    private double recoveryRemaining;
    private boolean returning;
    private List<Point> route=List.of();
    private int next;
    private Incident active;
    private long speechUntil,planAfter,deadline,failedSince=-1,teleportSince=-1,warp;
    private long positionMissingSince=-1;
    private double yaw;
    private String action="PATROL";
    private boolean patrolling=true;
    public PolicePatrol(Navigation navigation) { this(navigation,new Random()); }
    public PolicePatrol(Navigation navigation,java.util.random.RandomGenerator random) {
        this.navigation=navigation;position=navigation.spawn();
        wander=new NpcWander(position,new NpcWander.Navigation(){
            public List<Point> path(Point a,Point b){return navigation.path(a,b);}
            public Point destination(Point from,java.util.random.RandomGenerator rng){return navigation.patrolDestination(from,rng);}
        },random,1.6);
    }
    public void incident(Incident incident) {
        if(accepted.contains(incident.id())
                || active!=null && active.id().equals(incident.id())
                || pending.stream().anyMatch(queued -> queued.id().equals(incident.id()))) {
            metrics.increment("duplicate_requests");return;
        }
        if(pending.size()>=16) throw new IllegalStateException("경찰 출동 대기열 초과");
        accepted.add(incident.id());
        while(accepted.size()>ACCEPTED_HISTORY_LIMIT) accepted.removeFirst();
        pending.add(incident);
    }
    boolean hasIncidents(){return active!=null || !pending.isEmpty();}
    public View tick(long now,double dt,Map<String,Point> actors) {
        tickAt=now;
        if(now<speechUntil) return view(false);
        if(active!=null&&action.equals("TELEPORT_WARNING")) {
            if(active!=null && actors.containsKey(active.actor())) active.privateNotice().accept("");
            active=null;route=List.of();next=0;
            returning=!navigation.canPatrolFrom(position);planAfter=0;
            if(!returning){action="PATROL";return view(false);}
        }
        if(returning)return returnTick(now,dt);
        if(active!=null && action.equals("TALK")) { active=null; route=List.of(); }
        if(active==null && !pending.isEmpty()) {
            metrics.increment("visits.started");
            active=pending.remove(); route=List.of(); next=0; deadline=now+90_000; planAfter=0;
            failedSince=-1; teleportSince=-1;positionMissingSince=-1;
        }
        if(active!=null && !actors.containsKey(active.actor()) && now<=deadline) {
            if(positionMissingSince<0)positionMissingSince=now;
            route=List.of();next=0;failedSince=-1;teleportSince=-1;
            if(now-positionMissingSince<5000){action="WAITING_POSITION";return view(false);}
        }else positionMissingSince=-1;
        if(active!=null && (!actors.containsKey(active.actor()) || now>deadline)) {
            active.privateNotice().accept("가까이에서 안내하기 어려워 메시지로 전해요. 서로 존중하는 말을 사용해주세요.");
            active=null; route=List.of();
        }
        if(NpcUtility.choose(active!=null,false,false,active==null&&wander.resting(now)).action().equals("RESPOND")) {
            patrolling=false;
            var target=actors.get(active.actor());
            var approach=navigation.approachPoint(target);
            if (approach == null) {
                active.privateNotice().accept("물가에서는 가까이 갈 수 없어 메시지로 전해요. 서로 존중하는 말을 사용해주세요.");
                active = null;
                route = List.of();
                next = 0;
                returning = !navigation.canPatrolFrom(position);
                planAfter = 0;
                action = returning ? "RETURN_WAIT" : "PATROL";
                return view(false);
            }
            boolean inaccessible=navigation.requiresTeleport(active.actor(),target);
            boolean distant=Math.hypot(position.x()-approach.x(),position.z()-approach.z())>80;
            if(inaccessible||distant) { if(teleportSince<0)teleportSince=now; }
            else teleportSince=-1; // A normal jump must not leave a latched teleport reservation.
            boolean close=position.distance(approach)<=3.5 && navigation.lineClear(position,approach);
            if(!inaccessible && close) {
                yaw=Math.atan2(target.x()-position.x(),target.z()-position.z());
                action="TALK"; speechUntil=now+6000; route=List.of();
                active.privateNotice().accept("");
                active.arrived().accept(position); return view(false);
            }
            action="RESPOND";
            if(now>=planAfter && !route.isEmpty() && route.getLast().distance(approach)>2) {
                route=List.of();next=0;
            }
            if(close) { route=List.of();next=0;failedSince=-1;action="WAITING_TELEPORT"; }
            else if(next>=route.size() && now>=planAfter) {
                route=navigation.path(position,approach); next=Math.min(1,route.size()); planAfter=now+1000;
                if(route.size()<=1) {
                    action="WAITING_PATH";
                    if(failedSince<0) failedSince=now;
                } else failedSince=-1;
            }
            if(teleportSince>=0&&now-teleportSince>=5000 || failedSince>=0&&now-failedSince>=5000) {
                var destination=navigation.warningPoint(target);
                if(destination==null) { action="WAITING_TELEPORT";return view(false); }
                position=destination;warp++;
                yaw=Math.atan2(target.x()-position.x(),target.z()-position.z());
                route=List.of();next=0;action="TELEPORT_WARNING";speechUntil=now+3000;
                active.privateNotice().accept("가까이에서 안내할게요. 서로 존중하는 말을 사용해주세요.");
                active.arrived().accept(position);return view(false);
            }
        } else {
            if(!patrolling){wander.relocate(position);patrolling=true;}
            var stroll=wander.tick(now,dt,null);position=stroll.point();yaw=stroll.yaw();action=stroll.decision().action();
            return view(stroll.moving());
        }
        double budget=Math.max(0,Math.min(.25,dt))*(active==null?1.6:8.0);
        boolean moving=false;
        while(next<route.size() && budget>0) {
            var destination=route.get(next); double distance=position.distance(destination);
            if(distance<.001) { next++; continue; }
            double step=Math.min(distance,budget),ratio=step/distance;
            yaw=Math.atan2(destination.x()-position.x(),destination.z()-position.z());
            position=new Point(position.x()+(destination.x()-position.x())*ratio,
                    position.y()+(destination.y()-position.y())*ratio,position.z()+(destination.z()-position.z())*ratio);
            budget-=step; moving=true;
            if(step==distance) { position=destination; next++; }
        }
        return view(moving);
    }
    private View returnTick(long now,double dt) {
        if(recoveryNext>=recovery.size()) {
            if(navigation.canPatrolFrom(position)) {
                returning=false;recovery=List.of();action="PATROL";return view(false);
            }
            action="RETURN_WAIT";
            if(now<planAfter)return view(false);
            recovery=navigation.returnPath(position);recoveryNext=0;recoveryRemaining=0;planAfter=now+2000;
            if(recovery.isEmpty())return view(false);
        }
        double seconds=Math.max(0,Math.min(.25,dt));boolean moving=false;
        while(recoveryNext<recovery.size()&&seconds>0) {
            var step=recovery.get(recoveryNext);
            if(recoveryRemaining<=0)recoveryRemaining=step.seconds();
            if(recoveryRemaining<=0){recoveryNext++;continue;}
            double used=Math.min(seconds,recoveryRemaining),t=used/recoveryRemaining;
            var target=step.point();
            if(Math.hypot(target.x()-position.x(),target.z()-position.z())>.001)
                yaw=Math.atan2(target.x()-position.x(),target.z()-position.z());
            position=new Point(position.x()+(target.x()-position.x())*t,position.y()+(target.y()-position.y())*t,position.z()+(target.z()-position.z())*t);
            recoveryRemaining-=used;seconds-=used;moving=true;action=step.airborne()?"RETURN_JUMP":"RETURN";
            if(recoveryRemaining<.000001){recoveryNext++;recoveryRemaining=0;}
        }
        return view(moving);
    }
    private View view(boolean moving) { return new View("police","한순경",action,position.x(),position.y()-.8,position.z(),yaw,moving,warp,ambient.tick("police","POLICE",action.equals("PATROL")||action.equals("REST"),tickAt)); }
}
