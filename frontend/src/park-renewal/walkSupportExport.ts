import {createTowerRamp,createTowerDeck,OBSERVATION_TOWER} from '../config/parkLayout'
import type {PhysicalMesh,PhysicalHull} from '../map/park/physics'
import {accessWalkPatches} from './accessSurfaces'
import {BRIDGE,BRIDGE_LANDINGS,bridgeDeckHeight,site,heightAt} from './plan'

/** Export layered surfaces independently: a height field cannot represent three
 * spiral turns, nor both the bridge and the water bed beneath it. */
export function renewalWalkSupports(){
 const meshes:PhysicalMesh[]=[],hulls:PhysicalHull[]=[]
 for(const patch of accessWalkPatches()){
  const vertices=patch.outline.flatMap(([x,z])=>[x,patch.height(x,z),z]),indices:number[]=[]
  const signed=patch.outline.reduce((sum,p,i)=>{const q=patch.outline[(i+1)%patch.outline.length]!;return sum+p[0]*q[1]-q[0]*p[1]},0)
  for(let i=1;i<patch.outline.length-1;i++)indices.push(...(signed>0?[0,i+1,i]:[0,i,i+1]))
  meshes.push({id:patch.id,vertices,indices,role:'surface'})
  // Fill the plinth/stair volume, without inflating the horizontal boundary.
  const bottom=Math.min(...patch.outline.map(([x,z])=>heightAt(x,z)),...vertices.filter((_,i)=>i%3===1))-.15
  hulls.push({id:patch.id+'-body',role:'surface',vertices:[...vertices,...patch.outline.flatMap(([x,z])=>[x,bottom,z])]})
 }
 const vertices:number[]=[],indices:number[]=[],segments=Math.ceil((BRIDGE.x1-BRIDGE.x0)/.2)
 for(let i=0;i<=segments;i++){const x=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*i/segments;for(const side of[-1,1])vertices.push(x,bridgeDeckHeight(x),BRIDGE.z+side*BRIDGE.width/2)}
 for(let i=0;i<segments;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
 meshes.push({id:'renewal-lake-bridge',vertices,indices,role:'surface'})
 for(const [i,l]of BRIDGE_LANDINGS.entries())meshes.push({id:'renewal-bridge-landing-'+i,role:'surface',vertices:[l.x0,l.top,BRIDGE.z-l.width/2,l.x0,l.top,BRIDGE.z+l.width/2,l.x1,l.top,BRIDGE.z-l.width/2,l.x1,l.top,BRIDGE.z+l.width/2],indices:[0,1,2,1,3,2]})
 const t=site('tower'),base=heightAt(t.x,t.z)
 for(const [name,create]of [['ramp',createTowerRamp],['deck',createTowerDeck]]as const){
  const m=create(),v=Array.from(m.vertices)
  for(let i=0;i<v.length;i+=3){v[i]=t.x-(v[i]!-OBSERVATION_TOWER.x);v[i+1]=base+v[i+1]!*40/OBSERVATION_TOWER.height;v[i+2]=t.z-(v[i+2]!-OBSERVATION_TOWER.z)}
  meshes.push({id:'renewal-tower-'+name,role:'surface',vertices:v,indices:Array.from(m.indices)})
 }
 return {meshes,hulls}
}
