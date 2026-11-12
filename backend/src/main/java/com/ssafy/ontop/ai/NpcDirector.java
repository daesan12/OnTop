package com.ssafy.ontop.ai;

import java.util.ArrayList;
import java.util.List;

/** A deterministic utility selector over a reviewed waypoint graph. No model call in tick(). */
public final class NpcDirector {
    public record Point(double x, double z) { }
    public record Persona(String id,String name,String description,String role,int spawn,
                          List<String> greetings,double patrolWeight,double watchWeight,double incidentWeight,double speed) {
        public Persona {
            if(id==null || !id.matches("[a-z][a-z0-9_-]{0,31}") || name==null || name.isBlank() || name.length()>40
                    || description==null || description.length()>300 || !List.of("GUIDE","POLICE").contains(role)
                    || spawn<0 || spawn>=6 || greetings==null || greetings.isEmpty() || greetings.size()>20
                    || greetings.stream().anyMatch(s -> s==null || s.isBlank() || s.length()>200)
                    || !Double.isFinite(speed) || speed<.1 || speed>8
                    || !validWeight(patrolWeight) || !validWeight(watchWeight) || !validWeight(incidentWeight))
                throw new IllegalArgumentException("NPC 페르소나 설정 오류");
            greetings=List.copyOf(greetings);
        }
        private static boolean validWeight(double weight) { return Double.isFinite(weight) && weight>=0 && weight<=200; }
    }
    public record View(String id, String name, String persona, String action, double x, double z,
                       String speech, String speechSource, long speechUntil, long generation, String role) { }
    private static final List<Point> ROUTE = List.of(new Point(4, 4), new Point(16, 4),
            new Point(28, 4), new Point(28, 18), new Point(16, 18), new Point(4, 18));
    private final List<Actor> actors;
    private Point incident;
    private long incidentUntil;
    private final java.util.LinkedHashSet<String> acceptedIncidents=new java.util.LinkedHashSet<>();
    private String incidentSpeech="서로 존중하는 말로 대화해주세요.";
    private boolean omok;

    public NpcDirector() { this(defaultPersonas()); }
    public NpcDirector(List<Persona> personas) {
        if(personas==null || personas.isEmpty() || personas.size()>8 || personas.stream().map(Persona::id).distinct().count()!=personas.size())
            throw new IllegalArgumentException("NPC는 중복 없는 1~8개 설정이 필요합니다.");
        actors=new ArrayList<>(personas.stream().map(Actor::new).toList());
    }
    public static List<Persona> defaultPersonas() {
        return List.of(new Persona("guide","박영감","친근하고 능청스러운 오목 구경꾼","GUIDE",0,
                List.of("허허, 공원에 잘 왔구먼.","오늘은 어떤 놀이가 끌리는가?","천천히 둘러보게나."),10,60,0,2.8),
                new Persona("police","한순경","단호하지만 정중한 공원 순경","POLICE",3,
                        List.of("안녕하세요. 즐거운 공원 이용 되세요.","공원 질서를 살피고 있습니다.","도움이 필요하면 말씀해주세요."),10,0,100,2.8));
    }

    /** Eligibility and utility are separate: a busy conversation cannot be preempted by a new incident. */
    public synchronized java.util.Map<String, Double> utilities(String id, long now) {
        Actor actor = actor(id);
        var scores = new java.util.LinkedHashMap<String, Double>();
        scores.put("PATROL", actor.config.patrolWeight());
        if (now < actor.talkUntil) scores.put("TALK", 1000.0);
        if (actor.config.role().equals("POLICE") && actor.config.incidentWeight()>0 && incident != null && now < incidentUntil)
            scores.put("RESPOND_TO_VIOLATION", actor.config.incidentWeight() - Math.min(25, Math.hypot(actor.x-incident.x, actor.z-incident.z)));
        if (actor.config.role().equals("GUIDE") && actor.config.watchWeight()>0 && omok) scores.put("WATCH_OMOK", actor.config.watchWeight());
        if (scores.containsKey(actor.action)) scores.computeIfPresent(actor.action, (key, score) -> score + 5);
        return java.util.Map.copyOf(scores);
    }

    public synchronized void omok(boolean active) { omok = active; }
    public synchronized void incident(double x, double z, long now) {
        incident("local:"+now,x,z,"서로 존중하는 말로 대화해주세요.",now);
    }
    public synchronized void incident(String id,double x,double z,String speech,long now) {
        if(acceptedIncidents.contains(id)) return;
        if(actors.stream().noneMatch(a -> a.config.role().equals("POLICE") && a.config.incidentWeight()>0))
            throw new IllegalStateException("출동 가능한 경찰 NPC가 없습니다.");
        acceptedIncidents.add(id);
        while(acceptedIncidents.size()>64) acceptedIncidents.removeFirst();
        incidentSpeech=speech;
        // First version uses reviewed route nodes; never walks straight through arbitrary map obstacles.
        incident = ROUTE.stream().min(java.util.Comparator.comparingDouble(p -> Math.hypot(p.x - x, p.z - z))).orElseThrow();
        incidentUntil = now + 60_000;
        actors.stream().filter(a -> a.config.role().equals("POLICE")).forEach(a -> a.arrived=false);
    }
    public synchronized List<View> tick(long now, double seconds) {
        for (Actor actor : actors) {
            String action = utilities(actor.id, now).entrySet().stream()
                    .max(java.util.Map.Entry.comparingByValue()).orElseThrow().getKey();
            if (!action.equals(actor.action)) { actor.action = action; actor.generation++; actor.arrived = false; }
            if (action.equals("TALK")) continue;
            Point destination = action.equals("WATCH_OMOK") ? ROUTE.get(1)
                    : action.equals("RESPOND_TO_VIOLATION") ? incident : ROUTE.get(actor.next);
            // Route edges are the park's clear rectangular walkway, with one middle crossing.
            if (actor.goal == null || !actor.goal.equals(destination)) {
                actor.goal = destination;
                actor.arrived = false;
                chooseRoute(actor,destination);
            }
            Point next = ROUTE.get(actor.next);
            double distance = Math.hypot(next.x - actor.x, next.z - actor.z);
            if (distance > .01) {
                double step = Math.min(distance, Math.max(0,Math.min(seconds, .5)) * actor.config.speed());
                actor.x += (next.x - actor.x) / distance * step;
                actor.z += (next.z - actor.z) / distance * step;
            } else if (next.equals(destination)) {
                if (action.equals("PATROL")) { actor.direction=1; actor.next = (actor.next + 1) % ROUTE.size(); actor.goal = ROUTE.get(actor.next); }
                else if (!actor.arrived) {
                    actor.arrived = true;
                    say(actor, action.equals("WATCH_OMOK") ? "어디, 한 판 구경해 볼까?" : incidentSpeech, "FIXED", now);
                }
            } else actor.next = Math.floorMod(actor.next + actor.direction,ROUTE.size());
        }
        return views();
    }

    public synchronized long beginTalk(String id, long now) {
        Actor actor = actor(id);
        if (now < actor.talkUntil) throw new IllegalStateException("NPC가 다른 대화에 응답 중입니다.");
        actor.talkUntil = now + 12_000; actor.action = "TALK";
        return ++actor.generation;
    }
    public synchronized void finishTalk(String id, long generation, AiText.Reply reply, long now) {
        Actor actor = actor(id);
        if (actor.generation != generation || now >= actor.talkUntil) return;
        say(actor, reply.text(), reply.source(), now); actor.talkUntil = Math.min(actor.talkUntil, now + 3000);
    }
    public synchronized void cancelTalk(String id) { Actor a = actor(id); a.talkUntil = 0; a.generation++; }
    public synchronized boolean comment(String text, String source, long now) {
        return comment(text,source,now,false);
    }
    public synchronized boolean comment(String text,String source,long now,boolean terminal) {
        var guide=actors.stream().filter(a -> a.action.equals("WATCH_OMOK") && a.arrived && (terminal || now>=a.nextSpeech)).findFirst();
        guide.ifPresent(actor -> say(actor,text,source,now));
        return guide.isPresent();
    }
    public synchronized List<View> views() {
        return actors.stream().map(a -> new View(a.id, a.name, a.persona, a.action, a.x, a.z,
                a.speech, a.source, a.speechUntil, a.generation, a.config.role())).toList();
    }
    public synchronized String greeting(String id) { Actor a = actor(id); return a.config.greetings().get(Math.floorMod(a.lines++,a.config.greetings().size())); }
    public synchronized String persona(String id) { return actor(id).persona; }
    public static List<Point> route() { return ROUTE; }
    private static void chooseRoute(Actor actor,Point destination) {
        double best=Double.POSITIVE_INFINITY; int target=ROUTE.indexOf(destination);
        for(int start=0;start<ROUTE.size();start++) {
            var node=ROUTE.get(start);
            boolean straight=Math.abs(actor.x-node.x)<.01 && (node.x==4 || node.x==28)
                    || Math.abs(actor.z-node.z)<.01 && (node.z==4 || node.z==18);
            if(!straight) continue;
            for(int direction:List.of(1,-1)) {
                double cost=Math.hypot(actor.x-node.x,actor.z-node.z); int current=start;
                while(current!=target) {
                    int next=Math.floorMod(current+direction,ROUTE.size());
                    cost+=Math.hypot(ROUTE.get(next).x-ROUTE.get(current).x,ROUTE.get(next).z-ROUTE.get(current).z); current=next;
                }
                if(cost<best) { best=cost; actor.next=start; actor.direction=direction; }
            }
        }
    }
    private Actor actor(String id) { return actors.stream().filter(a -> a.id.equals(id)).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("알 수 없는 NPC")); }
    private void say(Actor actor, String text, String source, long now) {
        actor.speech = text; actor.source = source; actor.speechUntil = now + 8000; actor.nextSpeech = now + 20_000;
    }
    private static final class Actor {
        final String id, name, persona;
        final Persona config;
        double x, z;
        int next, lines, direction=1;
        long generation, talkUntil, speechUntil, nextSpeech;
        String action = "PATROL", speech = "", source = "FIXED";
        Point goal;
        boolean arrived;
        Actor(Persona config) {
            this.config=config; id=config.id(); name=config.name(); persona=config.description();
            x=ROUTE.get(config.spawn()).x; z=ROUTE.get(config.spawn()).z; next=config.spawn();
        }
    }
}
