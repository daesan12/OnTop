package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import java.util.*;

/** Local NPC ground navigation. Own collision world; never queries the player world's owner thread. */
public final class ParkNavigation implements AutoCloseable {
    public record Point(double x,double y,double z) {
        public double distance(Point p) { return Math.sqrt(Math.pow(x-p.x,2)+Math.pow(y-p.y,2)+Math.pow(z-p.z,2)); }
    }
    public record Area(double minX,double maxX,double minZ,double maxZ) {
        public Area {if(minX>=maxX||minZ>=maxZ)throw new IllegalArgumentException("순찰 구역 오류");}
        public boolean contains(Point p){return p.x()>=minX&&p.x()<=maxX&&p.z()>=minZ&&p.z()<=maxZ;}
    }
    public Area wholePark(){return new Area(-half+4,half-4,-half+4,half-4);}
    public Area plazaTables(){return new Area(Math.max(-32,-half+4),Math.min(32,half-4),Math.max(-24,-half+4),Math.min(64,half-4));}
    public Point spawn(Area area) {
        var center=groundPoint((area.minX+area.maxX)/2,(area.minZ+area.maxZ)/2);
        return nearest(center,6).filter(area::contains).orElseThrow(()->new IllegalStateException("중앙 NPC 시작 위치 없음"));
    }
    public Point randomDestination(Point from,Area area,java.util.random.RandomGenerator random) {
        for(int i=0;i<16;i++) {
            // Mostly a local stroll, sometimes a new neighborhood; no fixed route sequence.
            boolean local=random.nextDouble()<.65;
            double x=local?from.x()+random.nextDouble(-24,24):random.nextDouble(area.minX,area.maxX);
            double z=local?from.z()+random.nextDouble(-24,24):random.nextDouble(area.minZ,area.maxZ);
            int ix=(int)Math.round(x),iz=(int)Math.round(z);
            if(!area.contains(new Point(ix,0,iz)) || !walkable(ix,iz))continue;
            var p=point(ix,iz);if(p.distance(from)>=6)return p;
        }
        return null;
    }
    private final ParkScene scene;
    private final PhysicsSpace space;
    private final PositionCollision collision;
    private final double half;
    private final Map<Long,Boolean> walkable=new HashMap<>();
    private final Map<Long,Point> standing=new HashMap<>();
    private final Map<String,Boolean> edges=new HashMap<>();
    public ParkNavigation(ParkScene scene) {
        this(scene,null);
    }
    public ParkNavigation(ParkScene scene,com.ssafy.ontop.world.jumpmap.JumpCourse course) {
        this.scene=scene; half=scene.data.path("world").path("halfSize").asDouble();
        space=new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        var activeIds=new HashSet<String>();
        for(var shape:scene.shapes) {
            var body=new PhysicsRigidBody(shape.shape(),0);
            body.setUserObject(shape.id()); body.setPhysicsLocation(shape.center()); body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2); body.setCollideWithGroups(1); space.addCollisionObject(body);
            activeIds.add(shape.id());
        }
        if(course!=null) JumpCourseColliders.addTo(space,course);
        collision=new PositionCollision(scene,space,activeIds::contains);
    }
    public Point spawn() {
        var p=scene.spawn(1);
        return nearest(new Point(p.x,p.y,p.z),4).orElseThrow(() -> new IllegalStateException("경찰 시작 경로 없음"));
    }
    public Point point(int x,int z) { return standing.computeIfAbsent(key(x,z),ignored -> groundPoint(x,z)); }
    public Point groundPoint(double x,double z) {
        double ground=scene.groundHeight(x,z);
        var from=new com.jme3.math.Vector3f((float)x,(float)(ground+.26),(float)z);
        var to=new com.jme3.math.Vector3f((float)x,(float)(ground-.1),(float)z);
        return space.rayTest(from,to).stream().filter(h -> h.getCollisionObject().getCollisionGroup()==2)
                .sorted(Comparator.comparingDouble(com.jme3.bullet.collision.PhysicsRayTestResult::getHitFraction))
                .map(h -> new Point(x,from.y-(from.y-to.y)*h.getHitFraction()+.8,z))
                .filter(p -> collision.supported(new ClientPositionValidator.Pose(p.x,p.y,p.z))
                        && collision.clear(new ClientPositionValidator.Pose(p.x,p.y,p.z),new ClientPositionValidator.Pose(p.x,p.y,p.z),false))
                .findFirst().orElse(new Point(x,ground+.8,z));
    }
    private static long key(int x,int z) { return ((long)x<<32) ^ (z&0xffffffffL); }
    private boolean walkable(int x,int z) {
        return walkable.computeIfAbsent(key(x,z),ignored -> {
            if(Math.abs(x)>half-1 || Math.abs(z)>half-1) return false;
            var p=point(x,z); var lake=scene.data.path("lake");
            // Ground-only NPC never swims or climbs onto roofs/raised platforms.
            double ellipse=Math.pow((x-lake.path("x").asDouble())/lake.path("radiusX").asDouble(1),2)
                    +Math.pow((z-lake.path("z").asDouble())/lake.path("radiusZ").asDouble(1),2);
            if(ellipse<1.02 && p.y-.8<lake.path("surfaceY").asDouble()-.1) return false;
            var pose=new ClientPositionValidator.Pose(p.x,p.y,p.z);
            return collision.supported(pose) && collision.clear(pose,pose,false);
        });
    }
    private Optional<Point> nearest(Point target,int radius) {
        Point best=null; double distance=Double.POSITIVE_INFINITY;
        for(int x=(int)Math.round(target.x)-radius;x<=Math.round(target.x)+radius;x++)
            for(int z=(int)Math.round(target.z)-radius;z<=Math.round(target.z)+radius;z++) {
                if(!walkable(x,z)) continue;
                var candidate=point(x,z); double d=candidate.distance(target);
                if(d<distance) { best=candidate; distance=d; }
            }
        return Optional.ofNullable(best);
    }
    private boolean edge(Point from,Point to) {
        String id=key((int)from.x,(int)from.z)+":"+key((int)to.x,(int)to.z);
        return edges.computeIfAbsent(id,ignored -> Math.abs(from.y-to.y)<=.22 && collision.clear(
                new ClientPositionValidator.Pose(from.x,from.y,from.z),new ClientPositionValidator.Pose(to.x,to.y,to.z),false));
    }
    /** One-metre cardinal A*: no diagonal corner cutting; finite expansion budget. Empty means unreachable. */
    public List<Point> path(Point from,Point target) {
        return path(from,target,null);
    }
    public List<Point> path(Point from,Point target,Area area) {
        var goal=nearest(target,3);
        if(goal.isEmpty() || goal.get().distance(target)>3.5) return List.of();
        var start=nearest(from,2);
        if(start.isEmpty() || start.get().distance(from)>1.5 || !lineClear(from,start.get())) return List.of();
        record Visit(Point point,double priority) { }
        var open=new PriorityQueue<Visit>(Comparator.comparingDouble(Visit::priority));
        var cost=new HashMap<Point,Double>(); var parent=new HashMap<Point,Point>();
        var visited=new HashSet<Point>();
        cost.put(start.get(),0.0); open.add(new Visit(start.get(),0));
        int expanded=0;
        while(!open.isEmpty() && expanded<16000) {
            Point p=open.remove().point;
            if(!visited.add(p)) continue;
            expanded++;
            if(p.equals(goal.get())) {
                var path=new ArrayList<Point>();
                for(Point at=p;at!=null;at=parent.get(at)) path.add(at);
                Collections.reverse(path);
                if(!path.getFirst().equals(from)) path.addFirst(from);
                return smooth(path);
            }
            for(int[] delta:new int[][]{{1,0},{-1,0},{0,1},{0,-1}}) {
                int x=(int)p.x+delta[0],z=(int)p.z+delta[1];
                if(area!=null&&!area.contains(new Point(x,0,z)))continue;
                if(!walkable(x,z)) continue;
                var next=point(x,z); if(!edge(p,next)) continue;
                double nextCost=cost.get(p)+p.distance(next);
                if(nextCost>=cost.getOrDefault(next,Double.POSITIVE_INFINITY)) continue;
                parent.put(next,p); cost.put(next,nextCost); open.add(new Visit(next,nextCost+
                        Math.abs(next.x-goal.get().x)+Math.abs(next.z-goal.get().z)));
            }
        }
        return List.of();
    }
    private List<Point> smooth(List<Point> path) {
        if(path.size()<3)return List.copyOf(path);
        var result=new ArrayList<Point>();int at=0;result.add(path.getFirst());
        while(at<path.size()-1){
            int next=at+1;
            for(int i=Math.min(path.size()-1,at+12);i>at+1;i--)if(shortcut(path.get(at),path.get(i))){next=i;break;}
            result.add(path.get(next));at=next;
        }
        return List.copyOf(result);
    }
    private boolean shortcut(Point a,Point b) {
        if(!lineClear(a,b))return false;
        int steps=Math.max(1,(int)Math.ceil(a.distance(b)*2));
        for(int i=1;i<steps;i++){
            double t=(double)i/steps,x=a.x()+(b.x()-a.x())*t,z=a.z()+(b.z()-a.z())*t;
            if(!walkable((int)Math.round(x),(int)Math.round(z)))return false;
            if(Math.abs(groundPoint(x,z).y()-(a.y()+(b.y()-a.y())*t))>.15)return false;
        }
        return true;
    }
    public boolean lineClear(Point from,Point to) {
        return Math.abs(from.y-to.y)<.7 && traversalClear(from,to);
    }
    public boolean traversalClear(Point from,Point to) {
        return collision.clear(new ClientPositionValidator.Pose(from.x,from.y,from.z),
                new ClientPositionValidator.Pose(to.x,to.y,to.z),false);
    }
    /** Visual warning NPC has no player body. Allow an aerial warning, but never inside static geometry. */
    public Point warningPoint(Point actor) {
        for(double[] d:new double[][]{{1.25,0},{-1.25,0},{0,1.25},{0,-1.25},{0,0}}) {
            var point=new Point(actor.x+d[0],actor.y,actor.z+d[1]);
            if(lineClear(actor,point)) return point;
        }
        return null;
    }
    public List<NpcDescent.Step> returnToGround(Point from) {
        return new NpcDescent(new NpcDescent.Geometry() {
            private ClientPositionValidator.Pose pose(Point p){return new ClientPositionValidator.Pose(p.x,p.y,p.z);}
            public Point surfaceBelow(Point above) {
                if(Math.abs(above.x)>half-1||Math.abs(above.z)>half-1)return null;
                var p=collision.supportBelow(pose(above));return p==null?null:new Point(p.x(),p.y(),p.z());
            }
            public boolean supported(Point p){return collision.supported(pose(p));}
            public boolean clear(Point a,Point b){return traversalClear(a,b);}
            public boolean groundExit(Point p){return Math.abs(p.y-groundPoint(p.x,p.z).y)<.1&&!path(p,p).isEmpty();}
            public double gravity(){return Math.abs(scene.data.path("movement").path("gravity").asDouble());}
            public double jumpSpeed(Point p){return collision.jumpSpeed(pose(p),true);}
        }).find(from);
    }
    @Override public void close() { space.destroy(); }
}
