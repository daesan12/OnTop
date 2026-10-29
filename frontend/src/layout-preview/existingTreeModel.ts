import {buildParkTreeParts,type TreePlanting,type TreeShape} from '../world/art/parkTreeParts'
import type {Part} from '../world/art/Instances'

const shapes:TreeShape[]=['broadleaf','broadleaf','slender','cone','round','box','column']
const envelopes=new Map<TreeShape,{radius:number;height:number}>()
function envelope(kind:TreeShape){
  let e=envelopes.get(kind)
  if(!e){
    const p=buildParkTreeParts([{position:[0,0,0],scale:1,kind}])
    const leaves=[...p.crowns,...p.cones]
    e={radius:Math.max(...leaves.map(p=>Math.hypot(p.p[0],p.p[2])+Math.max(p.s[0],p.s[2])))*1.1,height:Math.max(...leaves.map(p=>p.p[1]+p.s[1]))*1.05}
    envelopes.set(kind,e)
  }
  return e
}

/** Reuse the service tree family at existing anchors, within the reserved canopy width. */
export function existingTreeModel(trunks:readonly Part[],crowns:readonly Part[]){
  const plantings:TreePlanting[]=trunks.map((t,i)=>{
    const crown=crowns[i]!,blossom=crown.c==='#c98f9e'?'#e8abc0':undefined
    const kind=blossom?'garden':shapes[i%shapes.length]!,e=envelope(kind)
    const y=t.p[1]-t.s[1]/2,height=crown.p[1]+crown.s[1]-y
    return {position:[t.p[0],y,t.p[2]],kind,blossom,scale:Math.min(height/e.height,Math.min(crown.s[0],crown.s[2])/e.radius)}
  })
  return {plantings,parts:buildParkTreeParts(plantings)}
}
