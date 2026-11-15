import {existingTreeModel} from '../src/layout-preview/existingTreeModel'
import {trunks,crowns} from '../src/layout-preview/sceneGeometry'
import {SITES as ORIGINAL_SITES} from '../src/layout-preview/layout'
import {site,heightAt,onRoad,insidePark,inLake,SITES,footprintDistance} from './plan'
import {treeEnvelope,treesOverlap,type TreeEnvelope} from './treeSpacing'
import {WEST_REST_ROW} from './landscapeRefinementPlan'
import type {TreePlanting} from '../src/world/art/parkTreeParts'
export const originalFitnessTrees=existingTreeModel(trunks,crowns).plantings.filter(p=>Math.hypot(p.position[0]-ORIGINAL_SITES.fitness.x,p.position[2]-ORIGINAL_SITES.fitness.z)<23)
// Preserve each surrounding tree unless its complete crown conflicts with the new circulation.
const gym=site('fitness'),ox=gym.x-ORIGINAL_SITES.fitness.x,oz=gym.z-ORIGINAL_SITES.fitness.z
const clear=(x:number,z:number,r:number)=>((x-gym.x)/(15+r))**2+((z-gym.z)/(11+r))**2>1&&insidePark(x,z,r+1)&&!inLake(x,z,r)&&!onRoad(x,z,r+.5)&&!SITES.some(s=>s.id!=='fitness'&&!s.kind&&s.radius&&footprintDistance(s,x,z)<r+.5)&&Math.hypot(x-WEST_REST_ROW.bench[0],z-WEST_REST_ROW.bench[1])>r+2.5&&Math.hypot(x-WEST_REST_ROW.lamp[0],z-WEST_REST_ROW.lamp[1])>r+.8
const accepted:TreeEnvelope[]=[]
export const renderedFitnessTrees=originalFitnessTrees.flatMap(p=>{
 const originalX=p.position[0]+ox,originalZ=p.position[2]+oz
 const candidate=(x:number,z:number):TreePlanting=>({...p,position:[x,heightAt(x,z),z]})
 const radius=treeEnvelope(candidate(originalX,originalZ)).radius
 let chosen:TreeEnvelope|undefined
 // Reserve complete crowns and branches while relocating the surrounding grove.
 // Equipment, ring benches and the central gym tree keep their original arrangement.
 for(let d=0;d<=24&&!chosen;d++)for(let i=0;i<(d===0?1:32);i++){
  const a=i/32*Math.PI*2,x=originalX+Math.cos(a)*d,z=originalZ+Math.sin(a)*d
  if(!clear(x,z,radius))continue
  const envelope=treeEnvelope(candidate(x,z))
  if(accepted.some(other=>treesOverlap(envelope,other)))continue
  chosen=envelope;break
 }
 if(!chosen)return []
 accepted.push(chosen)
 const [x,y,z]=chosen.tree.position
 return [{...p,position:[x-ox,y-heightAt(gym.x,gym.z),z-oz]as[number,number,number]}]
})
export const fitnessWorldTrees=renderedFitnessTrees.map(p=>({...p,position:[p.position[0]+ox,p.position[1]+heightAt(gym.x,gym.z),p.position[2]+oz]as [number,number,number]}))
