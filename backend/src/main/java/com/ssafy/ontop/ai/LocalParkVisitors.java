package com.ssafy.ontop.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Two named local fixtures walk on the same rectangle as NPCs. Not a replacement for production physics. */
public final class LocalParkVisitors {
    public record View(String author,String scope,double x,double z,boolean moving,double targetX,double targetZ,long version) { }
    private static final double LENGTH=76, SPEED=3.2;
    private static final List<String> AUTHORS=List.of("산책자 A","산책자 B");
    private final Map<String,Walker> walkers=new LinkedHashMap<>();
    public LocalParkVisitors() {
        for(String scope:List.of("world:one","world:two")) for(int i=0;i<AUTHORS.size();i++)
            walkers.put(scope+":"+AUTHORS.get(i),new Walker(AUTHORS.get(i),scope,i*2));
    }
    public synchronized View walk(String author,String scope,double x,double z) {
        Walker walker=walker(author,scope);
        double destination=project(x,z);
        double clockwise=wrap(destination-walker.position);
        walker.remaining=clockwise<=LENGTH/2?clockwise:clockwise-LENGTH;
        walker.destination=destination; walker.version++;
        return view(walker);
    }
    public synchronized View stop(String author,String scope) {
        Walker walker=walker(author,scope); walker.remaining=0; walker.destination=walker.position; walker.version++; return view(walker);
    }
    public synchronized void tick(double seconds) {
        if(!Double.isFinite(seconds) || seconds<0) return;
        double step=Math.min(.5,seconds)*SPEED;
        for(var walker:walkers.values()) if(Math.abs(walker.remaining)>.001) {
            double distance=Math.copySign(Math.min(Math.abs(walker.remaining),step),walker.remaining);
            walker.position=wrap(walker.position+distance); walker.remaining-=distance;
            if(Math.abs(walker.remaining)<.001) { walker.position=walker.destination; walker.remaining=0; }
        }
    }
    public synchronized NpcDirector.Point position(String author,String scope) {
        Walker walker=walkers.get(world(scope)+":"+author);
        return walker==null?new NpcDirector.Point(4,4):at(walker.position);
    }
    public synchronized List<String> audience(String author,String scope) {
        var origin=position(author,scope);
        var result=new java.util.ArrayList<String>(); result.add(author);
        for(String candidate:AUTHORS) if(!candidate.equals(author)) {
            var target=position(candidate,scope);
            if(scope.startsWith("game:") || Math.hypot(origin.x()-target.x(),origin.z()-target.z())<=20) result.add(candidate);
        }
        return List.copyOf(result);
    }
    public synchronized List<View> views(String scope) {
        return walkers.values().stream().filter(w -> w.scope.equals(world(scope))).map(LocalParkVisitors::view).toList();
    }
    private Walker walker(String author,String scope) {
        Walker walker=walkers.get(world(scope)+":"+author);
        if(walker==null) throw new IllegalArgumentException("이동은 로컬 사용자 A/B만 사용할 수 있습니다."); return walker;
    }
    private static String world(String scope) {
        if(!List.of("world:one","world:two","game:omok").contains(scope)) throw new IllegalArgumentException("검수 공간 오류");
        return scope.equals("game:omok")?"world:one":scope;
    }
    private static View view(Walker walker) {
        var here=at(walker.position); var target=at(walker.destination);
        return new View(walker.author,walker.scope,here.x(),here.z(),Math.abs(walker.remaining)>.001,target.x(),target.z(),walker.version);
    }
    private static double project(double x,double z) {
        if(!Double.isFinite(x) || !Double.isFinite(z) || x<0 || x>32 || z<0 || z>22) throw new IllegalArgumentException("공원 좌표 오류");
        double cx=Math.clamp(x,4,28),cz=Math.clamp(z,4,18);
        var candidates=List.of(new NpcDirector.Point(cx,4),new NpcDirector.Point(28,cz),new NpcDirector.Point(cx,18),new NpcDirector.Point(4,cz));
        var point=candidates.stream().min(java.util.Comparator.comparingDouble(p -> Math.hypot(p.x()-x,p.z()-z))).orElseThrow();
        if(Math.hypot(point.x()-x,point.z()-z)>1.15) throw new IllegalArgumentException("산책로를 눌러 이동해주세요. 잔디와 시설은 통과하지 않습니다.");
        if(point.z()==4) return point.x()-4;
        if(point.x()==28) return 24+point.z()-4;
        if(point.z()==18) return 38+28-point.x();
        return 62+18-point.z();
    }
    private static double wrap(double value) { return (value%LENGTH+LENGTH)%LENGTH; }
    private static NpcDirector.Point at(double offset) {
        double value=wrap(offset);
        if(value<=24) return new NpcDirector.Point(4+value,4);
        if(value<=38) return new NpcDirector.Point(28,4+value-24);
        if(value<=62) return new NpcDirector.Point(28-(value-38),18);
        return new NpcDirector.Point(4,18-(value-62));
    }
    private static final class Walker {
        final String author,scope;
        double position,destination,remaining;
        long version;
        Walker(String author,String scope,double position) { this.author=author; this.scope=scope; this.position=position; destination=position; }
    }
}
