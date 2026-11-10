package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

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
    /** 판 ID와 무관하게 실제 충돌 상태가 같은 사용자는 한 번의 월드 스텝을 공유한다. */
    record State(boolean started, Map<Integer, Pose> changes) {
        State {
            changes = Map.copyOf(changes);
        }
    }
    private static final Pose REST = new Pose(0, true);
    private static final State BEFORE_START = new State(false, Map.of());
    private static final State STARTED = new State(true, Map.of());
    private final JumpCourse course;
    private final List<PhysicsRigidBody> bodies;
    private final PhysicsSpace space;
    private final Map<String, Player> players = new HashMap<>();
    private final Set<PhysicsRigidBody> present = new HashSet<>();
    private final List<Integer> pigeons;
    private final float[] heights;
    private State applied;
    private double appliedTime;

    RenewalCourseMotion(JumpCourse course, List<PhysicsRigidBody> bodies, PhysicsSpace space) {
        this.course = course; this.bodies = bodies; this.space = space;
        present.addAll(bodies);
        heights = new float[bodies.size()];
        for (int block = 0; block < bodies.size(); block++) {
            heights[block] = (float) course.colliders().get(block).centerY();
        }
        pigeons = course.colliders().stream().map(JumpCourse.Collider::block)
                .filter(block -> "pigeon".equals(course.theme(block))).toList();
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
        prepare(state(user, now), now);
    }

    State state(String user, double now) {
        Player p=players.get(user);
        if (p == null || p.runId == null) {
            return BEFORE_START;
        }
        if(p!=null) for(var c:p.contacts.values()) {
            if(now-c.fallAt>=4 && Double.isFinite(c.fallAt)) { c.fallAt=Double.NEGATIVE_INFINITY; c.stoodAt=Double.NaN; }
            if(Double.isFinite(c.stoodAt) && !Double.isFinite(c.fallAt) && now-c.stoodAt>=3) c.fallAt=now;
        }
        Map<Integer, Pose> changes = new HashMap<>();
        for (int block : p.contacts.keySet()) {
            String theme = course.theme(block);
            if (!"lily".equals(theme) && !"mole".equals(theme)) {
                continue;
            }
            Pose pose = pose(user, block, now);
            if (!pose.solid() || (float) pose.offset() != 0) {
                // 사라진 발판의 낙하 거리는 충돌 상태에 영향을 주지 않는다.
                changes.put(block, pose.solid() ? pose : new Pose(0, false));
            }
        }
        return changes.isEmpty() ? STARTED : new State(true, changes);
    }

    void prepare(State state, double now) {
        if (state.equals(applied) && (!state.started() || now == appliedTime)) {
            return;
        }
        boolean changedMode = applied == null || state.started() != applied.started();
        if (changedMode) {
            // 시작/종료 때만 코스 전체의 표시 여부가 달라진다.
            for (int block = 0; block < bodies.size(); block++) {
                apply(block, new Pose(0, state.started() || block == 0));
            }
        } else if (state.started()) {
            Set<Integer> changedBlocks = new HashSet<>(applied.changes().keySet());
            changedBlocks.addAll(state.changes().keySet());
            for (int block : changedBlocks) {
                apply(block, state.changes().getOrDefault(block, REST));
            }
        }
        if (state.started()) {
            if (changedMode || now != appliedTime) {
                for (int block : pigeons) {
                    String id = course.colliders().get(block).id();
                    int index = Integer.parseInt(id.substring(id.lastIndexOf('-') + 1));
                    apply(block, new Pose(.42 * Math.sin(now * Math.PI * 2 / 3.8 + index * .53), true));
                }
            }
            if (changedMode) {
                state.changes().forEach(this::apply);
            }
        }
        applied = state;
        appliedTime = now;
    }

    private void apply(int block, Pose pose) {
        PhysicsRigidBody body = bodies.get(block);
        boolean registered = present.contains(body);
        if (!pose.solid()) {
            if (present.remove(body)) {
                space.removeCollisionObject(body);
            }
            return;
        }
        JumpCourse.Collider pad = course.colliders().get(block);
        float height = (float) (pad.centerY() + pose.offset());
        if (registered && heights[block] == height) {
            return;
        }
        // 움직인 정적 발판만 재등록해 Bullet broadphase와 sweep의 높이를 함께 갱신한다.
        if (registered) {
            space.removeCollisionObject(body);
        }
        body.setPhysicsLocation(new Vector3f((float) pad.x(), height, (float) pad.z()));
        space.addCollisionObject(body);
        present.add(body);
        heights[block] = height;
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
