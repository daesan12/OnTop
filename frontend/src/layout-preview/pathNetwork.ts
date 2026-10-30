import { joinPathContours } from './pathUnion'
import { BufferGeometry,Path,Shape,ShapeGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { DraftRoute,ParkPoint } from './layout'
import { DRAFT_LAKE } from './lakeLayout'

type Rect={x0:number;x1:number;z0:number;z1:number}
type Edge={a:ParkPoint;b:ParkPoint;used:boolean}
const key=(p:ParkPoint)=>`${p[0]},${p[1]}`
const area=(p:readonly ParkPoint[])=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length]!;return n+a[0]*b[1]-b[0]*a[1]},0)/2
function contains(p:ParkPoint,loop:readonly ParkPoint[]) {
  let inside=false
  for(let i=0,j=loop.length-1;i<loop.length;j=i++) {
    const a=loop[i]!,b=loop[j]!
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside
  }
  return inside
}
/** One union contour for the rectilinear network: no overlapping strips or seams at junctions. */
export function roadContours(routes:readonly DraftRoute[]):ParkPoint[][] {
  const rectangles:Rect[]=[]
  const rect=(x0:number,x1:number,z0:number,z1:number)=>{if(x1-x0>.001&&z1-z0>.001)rectangles.push({x0,x1,z0,z1})}
  for(const r of routes) {
    if(r.points.length>6)continue
    for(let i=1;i<r.points.length;i++) {
      const a=r.points[i-1]!,b=r.points[i]!,half=r.width/2
      if(Math.abs(a[1]-b[1])<.001) {
        const x0=Math.min(a[0],b[0])-.12,x1=Math.max(a[0],b[0])+.12,z=a[1]
        if(Math.abs(z-DRAFT_LAKE.z)<DRAFT_LAKE.rz) {
          const dx=DRAFT_LAKE.rx*Math.sqrt(1-((z-DRAFT_LAKE.z)/DRAFT_LAKE.rz)**2)
          rect(x0,Math.min(x1,DRAFT_LAKE.x-dx-.04),z-half,z+half)
          rect(Math.max(x0,DRAFT_LAKE.x+dx+.04),x1,z-half,z+half)
        } else rect(x0,x1,z-half,z+half)
      } else if(Math.abs(a[0]-b[0])<.001)rect(a[0]-half,a[0]+half,Math.min(a[1],b[1])-.12,Math.max(a[1],b[1])+.12)
    }
    for(let i=1;i<r.points.length-1;i++) {
      const p=r.points[i]!,half=r.width/2
      rect(p[0]-half,p[0]+half,p[1]-half,p[1]+half)
    }
  }
  const normalized=rectangles.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v*10000)/10000])) as Rect)
  const xs=[...new Set(normalized.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b),zs=[...new Set(normalized.flatMap(r=>[r.z0,r.z1]))].sort((a,b)=>a-b)
  const nx=xs.length-1,nz=zs.length-1,grid=new Uint8Array(nx*nz)
  const xi=new Map(xs.map((x,i)=>[x,i])),zi=new Map(zs.map((z,i)=>[z,i]))
  for(const r of normalized)for(let z=zi.get(r.z0)!;z<zi.get(r.z1)!;z++)for(let x=xi.get(r.x0)!;x<xi.get(r.x1)!;x++)grid[z*nx+x]=1
  const filled=(x:number,z:number)=>x>=0&&z>=0&&x<nx&&z<nz&&grid[z*nx+x]===1
  const edges:Edge[]=[],at=new Map<string,Edge[]>()
  const add=(a:ParkPoint,b:ParkPoint)=>{const e={a,b,used:false};edges.push(e);const k=key(a),list=at.get(k)??[];list.push(e);at.set(k,list)}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++)if(filled(x,z)) {
    const x0=xs[x]!,x1=xs[x+1]!,z0=zs[z]!,z1=zs[z+1]!
    if(!filled(x,z-1))add([x0,z0],[x1,z0])
    if(!filled(x+1,z))add([x1,z0],[x1,z1])
    if(!filled(x,z+1))add([x1,z1],[x0,z1])
    if(!filled(x-1,z))add([x0,z1],[x0,z0])
  }
  const loops:ParkPoint[][]=[]
  for(const first of edges) {
    if(first.used)continue
    const points:ParkPoint[]=[];let edge:Edge|undefined=first
    while(edge&&!edge.used){edge.used=true;points.push(edge.a);edge=at.get(key(edge.b))?.find(e=>!e.used)}
    const simple=points.filter((p,i)=>{
      const a=points[(i+points.length-1)%points.length]!,b=points[(i+1)%points.length]!
      return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>.00001
    })
    if(simple.length>=3)loops.push(simple)
  }
  return loops
}
/** Small corner cutbacks preserve the long straight axes and make junctions taper smoothly. */
function roundedPath(points:readonly ParkPoint[],radius=3):Path {
  // Boolean intersections split straight boundaries into short collinear edges.
  // Remove those splits before choosing fillet lengths, or tiny edges leave grass spikes.
  let simple=[...points],changed=true
  while(changed&&simple.length>3){
    changed=false
    const next=simple.filter((p,i)=>{
      const a=simple[(i+simple.length-1)%simple.length]!,b=simple[(i+1)%simple.length]!
      const ux=p[0]-a[0],uz=p[1]-a[1],vx=b[0]-p[0],vz=b[1]-p[1]
      const redundant=Math.hypot(ux,uz)<1e-5||Math.abs(ux*vz-uz*vx)<1e-5&&ux*vx+uz*vz>=0
      if(redundant)changed=true
      return !redundant
    })
    if(next.length<3)break
    simple=next
  }
  points=simple
  const path=new Path(),corners=points.map((p,i)=>{
    const a=points[(i+points.length-1)%points.length]!,b=points[(i+1)%points.length]!,before=Math.hypot(a[0]-p[0],a[1]-p[1]),after=Math.hypot(b[0]-p[0],b[1]-p[1]),turn=(p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]),cut=Math.min(turn<0?radius:1.2,before*.4,after*.4)
    return {p,start:[p[0]+(a[0]-p[0])*cut/before,p[1]+(a[1]-p[1])*cut/before] as ParkPoint,end:[p[0]+(b[0]-p[0])*cut/after,p[1]+(b[1]-p[1])*cut/after] as ParkPoint}
  })
  path.moveTo(corners[0]!.start[0],-corners[0]!.start[1])
  for(const c of corners){path.lineTo(c.start[0],-c.start[1]);path.quadraticCurveTo(c.p[0],-c.p[1],c.end[0],-c.end[1])}
  path.closePath();return path
}
export function buildPathNetwork(routes:readonly DraftRoute[]) {
  // Short diagonal approaches need ribbons too; the rectangular network only
  // contributes their horizontal/vertical segments.
  const diagonals=routes.filter(r=>r.points.length<=6).flatMap(r=>r.points.slice(1).flatMap((b,i)=>{
    const a=r.points[i]!
    return Math.abs(a[0]-b[0])>=.001&&Math.abs(a[1]-b[1])>=.001?[{...r,points:[a,b]}]:[]
  }))
  const loops=joinPathContours(roadContours(routes),[...routes.filter(r=>r.points.length>6),...diagonals]),outer=loops.filter(l=>area(l)>0),holes=loops.filter(l=>area(l)<0),geometries:BufferGeometry[]=[]
  const edges:ParkPoint[][]=[]
  for(const loop of outer) {
    const path=roundedPath(loop),shape=new Shape();shape.curves=path.curves
    for(const h of holes)if(contains(h[0]!,loop))shape.holes.push(roundedPath(h))
    const geometry=new ShapeGeometry(shape,8);geometry.rotateX(-Math.PI/2);geometry.translate(0,.085,0);geometries.push(geometry)
    edges.push(path.getPoints(8).map(p=>[p.x,-p.y]))
    for(const h of shape.holes)edges.push(h.getPoints(8).map(p=>[p.x,-p.y]))
  }
  const flat=geometries.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat)!
  const pos=geometry.getAttribute('position'),uv=geometry.getAttribute('uv')
  for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/1.2,pos.getZ(i)/1.2)
  for(const g of [...new Set([...geometries,...flat])])g.dispose()
  geometry.computeBoundingSphere()
  return {geometry,edges,contours:loops}
}
