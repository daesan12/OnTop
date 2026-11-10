package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import java.util.*;

/** 새 코스의 개인별 충돌 상태. owner thread에서 해당 사용자를 조회할 때만 물리 공간에 반영한다. */
final class RenewalCourseMotion {
    private static final class Contact {
        double stoodAt = Double.NaN, hitAt = Double.NEGATIVE_INFINITY, fallAt = Double.NEGATIVE_INFINITY;
    }
    private static final class Player {
        String runId;
        int support = -1;
        final Map<Integer, Contact> contacts = new HashMap<>();
    }
    record Pose(double offset, boolean solid) {}
    private final JumpCourse course;
    private final List<PhysicsRigidBody> bodies;
    private final PhysicsSpace space;
    private final Map<String, Player> players = new HashMap<>();
    private final Set<PhysicsRigidBody> present = new HashSet<>();

    RenewalCourseMotion(JumpCourse course, List<PhysicsRigidBody> bodies, PhysicsSpace space) {
        this.course = course; this.bodies = bodies; this.space = space;
        present.addAll(bodies);
    }

    void run(String user, String id) {
        Player p = players.computeIfAbsent(user, ignored -> new Player());
        if (!Objects.equals(p.runId,id)) { p.runId=id; p.contacts.clear(); p.support=-1; }
    }

    void remove(String user) { players.remove(user); }

    Pose pose(String user, int block, double now) {
        Player player = players.get(user);
        if (player == null || player.runId == null) return new Pose(0,block==0);
        Contact c = player.contacts.get(block);
        String theme = course.theme(block);
        if ("lily".equals(theme) && c != null) {
            double age = now-c.fallAt;
            if (age>=0 && age<4) return new Pose(-9*age*age,false);
        }
        if ("mole".equals(theme) && c != null) {
            double t = (now-c.hitAt)/.95;
            if (t>=0 && t<=1) return new Pose(-.48*Math.pow(Math.sin(Math.PI*t),2),true);
        }
        if ("pigeon".equals(theme)) {
            String id=course.colliders().get(block).id();
            int index=Integer.parseInt(id.substring(id.lastIndexOf('-')+1));
            return new Pose(.42*Math.sin(now*Math.PI*2/3.8+index*.53),true);
        }
        return new Pose(0,true);
    }

    void prepare(String user, double now) {
        Player p=players.get(user);
        if(p!=null) for(var c:p.contacts.values()) {
            if(now-c.fallAt>=4 && Double.isFinite(c.fallAt)) { c.fallAt=Double.NEGATIVE_INFINITY; c.stoodAt=Double.NaN; }
            if(Double.isFinite(c.stoodAt) && !Double.isFinite(c.fallAt) && now-c.stoodAt>=3) c.fallAt=now;
        }
        for(int i=0;i<bodies.size();i++) {
            var body=bodies.get(i);var pad=course.colliders().get(i);var pose=pose(user,i,now);
            if(pose.solid()) {
                var location=new Vector3f((float)pad.x(),(float)(pad.centerY()+pose.offset()),(float)pad.z());
                boolean registered=present.contains(body);
                if(!registered || !body.getPhysicsLocation(null).equals(location)) {
                    // Static transforms alone leave Bullet's broadphase at the old height.
                    // Reinsert only moved/restored pads so sweeps see the current support immediately,
                    // without advancing other players' physics or relaxing collision validation.
                    if(registered) space.removeCollisionObject(body);
                    body.setPhysicsLocation(location);
                    space.addCollisionObject(body);
                    present.add(body);
                }
            } else if(present.remove(body)) space.removeCollisionObject(body);
        }
    }

    void contact(String user, JumpCourse.Collider pad, double now) {
        Player p=players.get(user);
        if(p==null || p.runId==null) return;
        int next=pad==null?-1:pad.block();
        if(next==p.support) return;
        if(p.support>=0) { Contact previous=p.contacts.get(p.support);if(previous!=null)previous.stoodAt=Double.NaN; }
        p.support=next;
        if(pad==null) return;
        Contact c=p.contacts.computeIfAbsent(next,ignored->new Contact());
        if("mole".equals(course.theme(next)))c.hitAt=now;
        if("lily".equals(course.theme(next)))c.stoodAt=now;
    }
}
