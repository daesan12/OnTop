package com.ssafy.ontop.game.alkkagi.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.contact.Contact;
import org.dyn4j.dynamics.contact.SolvedContact;
import org.dyn4j.geometry.MassType;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.ContactCollisionData;
import org.dyn4j.world.World;
import org.dyn4j.world.listener.ContactListenerAdapter;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** 35a4f753 수치를 고정한 기준선과 후보를 같은 harness로 비교한다. 운영 부하 검사가 아니다. */
class AlkkagiModelStudyTests {
    static final double DT = 1.0 / 120;
    record Model(String name, List<Double> masses, List<Double> speeds, String curve,
                 String drag, double deceleration, double restitution,
                 boolean rotation, boolean ccd, boolean sleep, boolean dragAfter, boolean lowSpeedSnap) {
        double response(double p) { return switch (curve) {
            case "sqrt" -> Math.sqrt(p);
            case "soft" -> p * (1.5 - .5 * p);
            default -> p;
        }; }
        double speed(int size, double p) { return speeds.get(size) * response(p); }
    }
    static final Model BASE = new Model("baseline-35a4f753", List.of(.8, 3.2, 19.2),
            List.of(15., 15., 15.), "linear", "constant", 30, .9, false, true, true, false, false);
    static final Model CANDIDATE = new Model("candidate-separated", List.of(.8, 2.4, 6.4),
            List.of(12., 11., 10.), "soft", "constant", 18, .55, false, true, false, false, true);
    // 사용자가 실제 로컬 조작 후 선택한30/60/1. 이전 후보 결과는 덮어쓰지 않는다.
    static final Model SELECTED = new Model("user-selected-30-60-1", List.of(.8, 2.4, 6.4),
            List.of(30., 27.5, 25.), "soft", "constant", 60, 1, false, true, false, false, true);
    static List<Model> models() { return List.of(BASE,
            new Model("curve-sqrt", BASE.masses, BASE.speeds, "sqrt", "constant", 30,.9,false,true,true,false,false),
            new Model("curve-soft", BASE.masses, BASE.speeds, "soft", "constant", 30,.9,false,true,true,false,false),
            new Model("equal-impulse", BASE.masses, List.of(15.,3.75,.625), "linear","constant",30,.9,false,true,true,false,false),
            new Model("equal-energy", BASE.masses, List.of(15.,7.5,15/Math.sqrt(24)), "linear","constant",30,.9,false,true,true,false,false),
            new Model("type-speed-only", BASE.masses, List.of(15.,12.,10.), "linear","constant",30,.9,false,true,true,false,false),
            new Model("exponential-only", BASE.masses, BASE.speeds,"linear","exponential",6,.9,false,true,true,false,false),
            CANDIDATE, SELECTED); }
    record Particle(int size, double x, double y, double radius) { }
    static int size(AlkkagiMatch.PieceView p) { return p.radius() > .4 ? 2 : p.radius() > .3 ? 1 : 0; }
    static List<Particle> initialBoard() {
        return new AlkkagiMatch(AlkkagiSettings.provisional()).snapshot(0).pieces().stream()
                .map(p -> new Particle(size(p),p.x(),p.y(),p.radius())).toList();
    }
    static void drag(Body body, Model model) {
        double speed=body.getLinearVelocity().getMagnitude();
        double next=model.drag.equals("exponential") ? speed*Math.exp(-model.deceleration*DT)
                : Math.max(0,speed-model.deceleration*DT);
        if (model.lowSpeedSnap && next < .025) next=0;
        body.setLinearVelocity(speed>0 ? body.getLinearVelocity().product(next/speed) : new Vector2());
    }
    static List<Double> velocity(Body b) { return List.of(b.getLinearVelocity().x,b.getLinearVelocity().y); }
    static Map<String,Object> point(Body b, boolean alive) {
        return Map.of("x",b.getWorldCenter().x,"y",b.getWorldCenter().y,
                "vx",b.getLinearVelocity().x,"vy",b.getLinearVelocity().y,"alive",alive);
    }
    record Run(Map<String,Object> summary, List<Map<String,Object>> frames, List<Map<String,Object>> contacts) { }

    static Run simulate(Model model, List<Particle> layout, int shooter, double power,
                        double dx,double dy, boolean boundary) {
        var world=new World<Body>(); world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(DT); world.getSettings().setMaximumTranslation(2);
        world.getSettings().setAtRestDetectionEnabled(model.sleep);
        var bodies=new ArrayList<Body>(); var alive=new ArrayList<Boolean>();
        var masses=new ArrayList<Double>();
        for(int i=0;i<layout.size();i++) {
            var p=layout.get(i); var mass=model.masses.get(p.size);
            var b=AlkkagiMatch.collisionBody(p.radius,mass,model.restitution);
            if(model.rotation) b.setMassType(MassType.NORMAL);
            b.setBullet(model.ccd); b.translate(p.x,p.y); b.setUserData(i);
            assertThat(b.getMass().getMass()).isCloseTo(mass,org.assertj.core.data.Offset.offset(1e-9));
            world.addBody(b); bodies.add(b); alive.add(true); masses.add(b.getMass().getMass());
        }
        var contacts=new ArrayList<Map<String,Object>>();
        var pre=new HashMap<String,List<List<Double>>>(); final int[] step={0}, begins={0};
        world.addContactListener(new ContactListenerAdapter<Body>() {
            public void begin(ContactCollisionData<Body> d, Contact c) { begins[0]++; }
            public void preSolve(ContactCollisionData<Body> d, Contact c) {
                var cc=d.getContactConstraint();
                pre.put(cc.getBody1().getUserData()+":"+cc.getBody2().getUserData(),
                        List.of(velocity(cc.getBody1()),velocity(cc.getBody2())));
            }
            public void postSolve(ContactCollisionData<Body> d, SolvedContact c) {
                if(!c.isSolved()||c.getNormalImpulse()<1e-6) return;
                var cc=d.getContactConstraint();var a=cc.getBody1();var b=cc.getBody2();
                var before=pre.get(a.getUserData()+":"+b.getUserData());
                if(before==null) return;
                var normal=cc.getNormal();
                contacts.add(Map.of("step",step[0],"bodyIds",List.of(a.getUserData(),b.getUserData()),
                        "masses",List.of(a.getMass().getMass(),b.getMass().getMass()),"preVelocities",before,
                        "postVelocities",List.of(velocity(a),velocity(b)),"normal",List.of(normal.x,normal.y),
                        "relativeNormalVelocity",(before.get(1).get(0)-before.get(0).get(0))*normal.x
                            +(before.get(1).get(1)-before.get(0).get(1))*normal.y,
                        "normalImpulse",c.getNormalImpulse()));
            }
        });
        var projectile=bodies.get(shooter); double initialSpeed=model.speed(layout.get(shooter).size,power);
        projectile.applyImpulse(new Vector2(dx,dy).multiply(initialSpeed*projectile.getMass().getMass()));
        var frames=new ArrayList<Map<String,Object>>();var nanos=new ArrayList<Long>();
        double maxSpeed=initialSpeed,maxTranslation=0;int stable=0,firstStopped=-1;
        frames.add(Map.of("time",0.,"pieces",bodies.stream().map(b->point(b,true)).toList()));
        for(int i=0;i<1200;i++) {
            step[0]=i+1;
            long started=System.nanoTime();
            if(!model.dragAfter) for(int j=0;j<bodies.size();j++) if(alive.get(j)) drag(bodies.get(j),model);
            world.step(1);
            if(model.dragAfter) for(int j=0;j<bodies.size();j++) if(alive.get(j)) drag(bodies.get(j),model);
            nanos.add(System.nanoTime()-started);
            boolean moving=false;
            for(int j=0;j<bodies.size();j++) {
                var b=bodies.get(j);if(!alive.get(j))continue;
                double s=b.getLinearVelocity().getMagnitude(); maxSpeed=Math.max(maxSpeed,s);
                maxTranslation=Math.max(maxTranslation,b.getChangeInPosition().getMagnitude());
                assertThat(Double.isFinite(b.getWorldCenter().x)&&Double.isFinite(b.getWorldCenter().y)).isTrue();
                if(boundary&&(Math.abs(b.getWorldCenter().x)>4.5||Math.abs(b.getWorldCenter().y)>5)) {
                    alive.set(j,false);world.removeBody(b);
                } else if(s>.025) moving=true;
            }
            var ps=new ArrayList<Map<String,Object>>();for(int j=0;j<bodies.size();j++)ps.add(point(bodies.get(j),alive.get(j)));
            frames.add(Map.of("time",(i+1)*DT,"pieces",ps));
            if(!moving&&firstStopped<0)firstStopped=i+1;
            stable=moving?0:stable+1;if(stable>=24)break;
        }
        var travel=new ArrayList<Double>();for(int j=0;j<bodies.size();j++) travel.add(Math.hypot(
                bodies.get(j).getWorldCenter().x-layout.get(j).x,bodies.get(j).getWorldCenter().y-layout.get(j).y));
        var ordered=nanos.stream().sorted().toList();var result=new LinkedHashMap<String,Object>();
        result.put("model",model.name);result.put("power",power);result.put("initialSpeed",initialSpeed);
        result.put("launchMomentum",initialSpeed*projectile.getMass().getMass());
        result.put("launchEnergy",.5*projectile.getMass().getMass()*initialSpeed*initialSpeed);
        result.put("actualMasses",masses);result.put("travel",travel);result.put("maxSpeed",maxSpeed);
        result.put("steps",frames.size()-1);result.put("stopSeconds",Math.max(0,firstStopped)*DT);
        result.put("settled",stable>=24);result.put("contactBeginCount",begins[0]);
        result.put("solverContactSamples",contacts.size()); result.put("maxStepTranslation",maxTranslation);
        result.put("eliminated",alive.stream().filter(a->!a).count());result.put("final",frames.getLast());
        result.put("stepMicrosP50",ordered.get(ordered.size()/2)/1000.);
        result.put("stepMicrosP95",ordered.get((int)((ordered.size()-1)*.95))/1000.);
        return new Run(result,frames,contacts);
    }

    @Test void 기준선과_후보의_동일조건_물리행렬을_측정한다() throws Exception {
        assertThat(BASE.lowSpeedSnap).isFalse();
        assertThat(CANDIDATE.lowSpeedSnap).isTrue();
        // 이전 커밋에서 보존한 두물체/자유발사 원시값과 기준선 재구성을 대조한다.
        assertThat((Double)simulate(BASE,List.of(new Particle(2,0,0,.43)),0,1,1,0,false)
                .summary.get("initialSpeed")).isEqualTo(15);
        var legacyHead=simulate(BASE,List.of(new Particle(0,0,0,.24),new Particle(2,.72,0,.43)),0,1,1,0,false);
        assertThat(((List<Double>)legacyHead.summary.get("travel")).get(1))
                .isCloseTo(.02436333333333318,org.assertj.core.data.Offset.offset(1e-10));
        // 계수 변경 전에도 그대로 실행하는 고정 기준선. 출력은 build 아래에만 둔다.
        var rows=new ArrayList<Map<String,Object>>();var events=new ArrayList<Map<String,Object>>();
        var traces=new ArrayList<Map<String,Object>>();
        for(var model:models()) {
            simulate(model,List.of(new Particle(0,0,0,.24)),0,.5,1,0,false); // 한 번 워밍업
            for(int size=0;size<3;size++)for(double p:new double[]{.25,.5,.75,1}) {
                var run=simulate(model,List.of(new Particle(size,0,0,new double[]{.24,.32,.43}[size])),0,p,1,0,false);
                rows.add(tag(run.summary,"free-size"+size));
                if(model==BASE||model==CANDIDATE||model==SELECTED)traces.add(Map.of("model",model.name,"scenario","free-"+size+"-"+p,"frames",run.frames));
            }
            for(int[] pair:new int[][]{{0,2},{2,0},{1,2},{2,1},{0,0},{1,1},{2,2}}) {
                for(boolean glancing:new boolean[]{false,true}) {
                    double r1=new double[]{.24,.32,.43}[pair[0]],r2=new double[]{.24,.32,.43}[pair[1]];
                    var layout=List.of(new Particle(pair[0],0,0,r1),new Particle(pair[1],r1+r2+.05,glancing?(r1+r2)*.6:0,r2));
                    var run=simulate(model,layout,0,1,1,0,false);
                    var scenario="pair-"+pair[0]+"-"+pair[1]+(glancing?"-glance":"-head");
                    rows.add(tag(run.summary,scenario));
                    if(model==BASE||model==CANDIDATE||model==SELECTED) {
                        events.add(Map.of("model",model.name,"scenario",scenario,"contacts",run.contacts));
                        traces.add(Map.of("model",model.name,"scenario",scenario,"frames",run.frames));
                    }
                }
            }
            var chain=simulate(model,List.of(new Particle(2,0,0,.43),new Particle(0,.9,0,.24),
                    new Particle(1,1.65,.1,.32),new Particle(0,2.4,0,.24)),0,1,1,0,false);
            rows.add(tag(chain.summary,"chain"));
            if(model==BASE||model==CANDIDATE||model==SELECTED)events.add(Map.of("model",model.name,"scenario","chain","contacts",chain.contacts));
            for(int shooter:new int[]{13,0,8}) for(double p:new double[]{.25,.5,1}) {
                var board=simulate(model,initialBoard(),shooter,p,0,-1,true);
                var again=simulate(model,initialBoard(),shooter,p,0,-1,true);
                assertThat(board.summary.get("final")).isEqualTo(again.summary.get("final"));
                assertThat(board.summary.get("settled")).isEqualTo(true);
                rows.add(tag(board.summary,"board32-p"+shooter));
                if(model==BASE||model==CANDIDATE||model==SELECTED)traces.add(Map.of("model",model.name,"scenario","board32-p"+shooter+"-"+p,"frames",board.frames));
            }
            var outward=simulate(model,initialBoard(),0,1,0,1,true);
            if(model==BASE||model==CANDIDATE||model==SELECTED) assertThat((Long)outward.summary.get("eliminated")).isEqualTo(1);
            rows.add(tag(outward.summary,"board32-outward"));
            if(model==BASE||model==CANDIDATE||model==SELECTED)traces.add(Map.of("model",model.name,"scenario","board32-outward","frames",outward.frames));
        }
        var probes=new ArrayList<Map<String,Object>>();
        for(var variant:List.of(BASE,new Model("probe-rotation",BASE.masses,BASE.speeds,"linear","constant",30,.9,true,true,true,false,false),
                new Model("probe-no-ccd",BASE.masses,BASE.speeds,"linear","constant",30,.9,false,false,true,false,false),
                new Model("probe-no-sleep",BASE.masses,BASE.speeds,"linear","constant",30,.9,false,true,false,false,false),
                new Model("probe-drag-after",BASE.masses,BASE.speeds,"linear","constant",30,.9,false,true,true,true,false))) {
            probes.add(simulate(variant,List.of(new Particle(2,0,0,.43),new Particle(0,.72,.25,.24)),0,1,1,0,false).summary);
        }
        var folder=Path.of("build/alkkagi/model-study");Files.createDirectories(folder);var mapper=new ObjectMapper();
        var engineSettings=new org.dyn4j.dynamics.Settings();
        var auditBody=AlkkagiMatch.collisionBody(.24,.8,.9);
        var audit=Map.of("defaultAtRestLinearVelocity",engineSettings.getMaximumAtRestLinearVelocity(),
                "defaultAtRestAngularVelocity",engineSettings.getMaximumAtRestAngularVelocity(),
                "defaultAtRestSeconds",engineSettings.getMinimumAtRestTime(),
                "defaultCcd",engineSettings.getContinuousDetectionMode().toString(),
                "fixtureRestitutionVelocity",auditBody.getFixture(0).getRestitutionVelocity(),
                "massType",auditBody.getMass().getType().toString(),
                "inverseMass",auditBody.getMass().getInverseMass(),"inverseInertia",auditBody.getMass().getInverseInertia());
        mapper.writerWithDefaultPrettyPrinter().writeValue(folder.resolve("summary.json").toFile(),Map.of(
                "baselineCommit","35a4f753","scope","local deterministic fixed-step, instrumented/JIT timings not production benchmark",
                "models",models(),"rows",rows,"probes",probes,"engineAudit",audit));
        mapper.writeValue(folder.resolve("contacts.json").toFile(),events);
        mapper.writeValue(folder.resolve("traces.json").toFile(),traces);
    }

    @Test void 채택모델의_계측세계와_실제경기_전체좌표_탈락_턴전환이_일치한다() {
        for(int shooter:new int[]{13,0,8}) for(double power:new double[]{.25,.5,1}) {
            var measured=simulate(SELECTED,initialBoard(),shooter,power,0,-1,true);
            var match=new AlkkagiMatch(AlkkagiSettings.provisional());match.start(0);
            var before=match.snapshot(0);
            match.shoot(0,new AlkkagiMatch.Shot(before.gameId(),"study",before.version(),"p"+shooter,0,-1,power),1);
            int steps=0;while(match.snapshot(0).stage().equals("SIMULATING")&&steps<1200)match.advance(2+Math.round(++steps*DT*1000));
            assertThat(steps).isEqualTo(measured.summary.get("steps"));
            assertThat(match.snapshot(0).turn()).isEqualTo(1);
            var expected=(List<?>) measured.frames.getLast().get("pieces");
            for(int i=0;i<32;i++) {
                var p=match.snapshot(0).pieces().get(i);var e=(Map<?,?>)expected.get(i);
                assertThat(p.x()).isCloseTo((Double)e.get("x"),org.assertj.core.data.Offset.offset(1e-8));
                assertThat(p.y()).isCloseTo((Double)e.get("y"),org.assertj.core.data.Offset.offset(1e-8));
                assertThat(p.alive()).isEqualTo(e.get("alive"));
            }
        }
    }
    static Map<String,Object> tag(Map<String,Object> row,String scenario) {
        var result=new LinkedHashMap<>(row);result.put("scenario",scenario);return result;
    }
}
