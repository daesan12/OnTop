import type { DraftRoute,ParkPoint } from './layout'

const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx
const pointKey=(p:ParkPoint)=>`${Math.round(p[0]*1e5)},${Math.round(p[1]*1e5)}`
const signedArea=(p:readonly ParkPoint[])=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length]!;return n+cross(a[0],a[1],b[0],b[1])},0)/2
function inside(p:ParkPoint,polygon:readonly ParkPoint[]) {
  let result=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i]!,b=polygon[j]!
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result
  }
  return result
}

/** Merge curved ribbons with the straight network before paving or placing curbs. */
export function joinPathContours(straight:ParkPoint[][],curved:readonly DraftRoute[]):ParkPoint[][] {
  const quads:ParkPoint[][]=[]
  for(const route of curved) {
    const closed=pointKey(route.points[0]!)===pointKey(route.points.at(-1)!),points=closed?route.points.slice(0,-1):route.points
    const normals=points.map((p,i)=>{
      const before=points[i===0?(closed?points.length-1:0):i-1]!,after=points[i===points.length-1?(closed?0:i):i+1]!
      const unit=(a:ParkPoint,b:ParkPoint)=>{const x=b[0]-a[0],z=b[1]-a[1],l=Math.hypot(x,z)||1;return [z/l,-x/l] as const}
      const n0=unit(before,p),n1=unit(p,after),nx=n0[0]+n1[0],nz=n0[1]+n1[1],l=Math.hypot(nx,nz)||1
      const bx=nx/l,bz=nz/l,scale=route.width/2/Math.max(.5,Math.abs(bx*(i===points.length-1&&!closed?n0[0]:n1[0])+bz*(i===points.length-1&&!closed?n0[1]:n1[1])))
      return [bx*scale,bz*scale] as const
    })
    for(let i=0;i<(closed?points.length:points.length-1);i++) {
      const j=(i+1)%points.length,a=points[i]!,b=points[j]!,n=normals[i]!,m=normals[j]!
      const quad:ParkPoint[]=[[a[0]+n[0],a[1]+n[1]],[b[0]+m[0],b[1]+m[1]],[b[0]-m[0],b[1]-m[1]],[a[0]-n[0],a[1]-n[1]]]
      quads.push(signedArea(quad)>0?quad:quad.reverse())
    }
  }
  if(!quads.length)return straight
  const regions=[...straight,...quads].map((points,i)=>({points,hole:i<straight.length&&signedArea(points)<0,
    x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),z0:Math.min(...points.map(p=>p[1])),z1:Math.max(...points.map(p=>p[1]))}))
  const filled=(p:ParkPoint)=>{
    let winding=0
    for(let i=0;i<regions.length;i++) {
      const r=regions[i]!
      if(p[0]<r.x0||p[0]>r.x1||p[1]<r.z0||p[1]>r.z1||!inside(p,r.points))continue
      if(i>=straight.length)return true
      winding+=r.hole?-1:1
    }
    return winding>0
  }
  const segments=regions.flatMap(r=>r.points.map((a,i)=>({a,b:r.points[(i+1)%r.points.length]!,cuts:[0,1]})))
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++) {
    const a=segments[i]!,b=segments[j]!,dx=a.b[0]-a.a[0],dz=a.b[1]-a.a[1],ex=b.b[0]-b.a[0],ez=b.b[1]-b.a[1]
    if(Math.max(a.a[0],a.b[0])+1e-6<Math.min(b.a[0],b.b[0])||Math.min(a.a[0],a.b[0])-1e-6>Math.max(b.a[0],b.b[0])||Math.max(a.a[1],a.b[1])+1e-6<Math.min(b.a[1],b.b[1])||Math.min(a.a[1],a.b[1])-1e-6>Math.max(b.a[1],b.b[1]))continue
    const determinant=cross(dx,dz,ex,ez),qx=b.a[0]-a.a[0],qz=b.a[1]-a.a[1]
    if(Math.abs(determinant)>1e-9) {
      const t=cross(qx,qz,ex,ez)/determinant,u=cross(qx,qz,dx,dz)/determinant
      if(t>=-1e-7&&t<=1+1e-7&&u>=-1e-7&&u<=1+1e-7){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)))}
    } else if(Math.abs(cross(qx,qz,dx,dz))<1e-7) {
      for(const [s,other] of [[a,b],[b,a]] as const) {
        const vx=s.b[0]-s.a[0],vz=s.b[1]-s.a[1],length=vx*vx+vz*vz
        for(const p of [other.a,other.b]){const t=((p[0]-s.a[0])*vx+(p[1]-s.a[1])*vz)/length;if(t>0&&t<1)s.cuts.push(t)}
      }
    }
  }
  const edges=new Map<string,{a:ParkPoint;b:ParkPoint;used:boolean}>()
  for(const s of segments) {
    const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b),dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],length=Math.hypot(dx,dz)
    if(length<1e-8)continue
    for(let i=1;i<cuts.length;i++) {
      const t=cuts[i-1]!,u=cuts[i]!
      if(u-t<1e-7)continue
      const m=(t+u)/2,x=s.a[0]+dx*m,z=s.a[1]+dz*m,epsilon=.00005
      const left=filled([x-dz/length*epsilon,z+dx/length*epsilon]),right=filled([x+dz/length*epsilon,z-dx/length*epsilon])
      if(left===right)continue
      const at=(v:number):ParkPoint=>[s.a[0]+dx*v,s.a[1]+dz*v],a=at(left?t:u),b=at(left?u:t)
      edges.set(`${pointKey(a)}:${pointKey(b)}`,{a,b,used:false})
    }
  }
  const at=new Map<string,typeof edges extends Map<string,infer E>?E[]:never>()
  for(const e of edges.values()){const k=pointKey(e.a),list=at.get(k)??[];list.push(e);at.set(k,list)}
  const loops:ParkPoint[][]=[]
  for(const start of edges.values()) {
    if(start.used)continue
    const loop:ParkPoint[]=[];let edge:typeof start|undefined=start,lastEnd=start.a
    while(edge&&!edge.used){edge.used=true;loop.push(edge.a);lastEnd=edge.b;edge=at.get(pointKey(edge.b))?.find(e=>!e.used)}
    if(loop.length>=3&&Math.abs(signedArea(loop))>.0001) {
      if(pointKey(loop[0]!)!==pointKey(lastEnd))throw new Error("Unclosed park paving contour")
      loops.push(loop)
    }
  }
  return loops
}
