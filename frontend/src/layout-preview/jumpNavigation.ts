import { canWalk } from './layout'
import { JUMP_START } from './jumpCourse'
export type ReturnPoint={x:number;z:number}
export const jumpReturnRoute:{points:ReturnPoint[]}={points:[]}
export function clearReturnSegment(a:ReturnPoint,b:ReturnPoint) {
  const count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4)
  for(let i=0;i<=count;i++)if(!canWalk(a.x+(b.x-a.x)*i/Math.max(1,count),a.z+(b.z-a.z)*i/Math.max(1,count)))return false
  return true
}
/** A preview-only walking/swimming route; no teleport or service navigation mutation. */
export function findJumpReturnPath(start:ReturnPoint):ReturnPoint[] {
  const grid=(p:ReturnPoint)=>({x:Math.round(p.x/2)*2,z:Math.round(p.z/2)*2}),target=grid(JUMP_START),origin=grid(start)
  const key=(p:ReturnPoint)=>`${p.x},${p.z}`,open=[origin],cost=new Map([[key(origin),0]]),came=new Map<string,ReturnPoint>(),closed=new Set<string>()
  const score=(p:ReturnPoint)=>(cost.get(key(p))??Infinity)+Math.hypot(p.x-target.x,p.z-target.z)
  let end:ReturnPoint|undefined
  for(let n=0;open.length&&n<20000;n++) {
    let best=0;for(let i=1;i<open.length;i++)if(score(open[i]!)<score(open[best]!))best=i
    const p=open.splice(best,1)[0]!,pk=key(p);if(closed.has(pk))continue;closed.add(pk)
    if(Math.hypot(p.x-JUMP_START.x,p.z-JUMP_START.z)<3&&clearReturnSegment(p,JUMP_START)){end=p;break}
    for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2],[2,2],[2,-2],[-2,2],[-2,-2]]) {
      const q={x:p.x+dx!,z:p.z+dz!},qk=key(q),c=cost.get(pk)!+Math.hypot(dx!,dz!)
      if(closed.has(qk)||Math.abs(q.x)>88||Math.abs(q.z)>88||!clearReturnSegment(p,q)||c>=(cost.get(qk)??Infinity))continue
      cost.set(qk,c);came.set(qk,p);open.push(q)
    }
  }
  if(!end)return []
  const points:ReturnPoint[]=[JUMP_START,end];let p=end
  while(came.has(key(p))){p=came.get(key(p))!;points.push(p)}points.reverse()
  if(clearReturnSegment(start,points[0]!))points.unshift(start)
  const output=[points[0]!];let i=0
  while(i<points.length-1){let j=points.length-1;while(j>i+1&&!clearReturnSegment(points[i]!,points[j]!))j--;output.push(points[j]!);i=j}
  return output
}
