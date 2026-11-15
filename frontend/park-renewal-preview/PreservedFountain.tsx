import {Group,Mesh} from 'three'
import {useLayoutEffect,useRef} from 'react'
import {ParkFountain} from '../src/world/art/ParkFountain'
import {ReferenceBench} from '../src/world/art/ReferenceBenchFrames'
import {FOUNTAIN} from '../src/config/parkPlan'
import {PARK_DATA} from '../src/map/park'
import {SITES as ORIGINAL,DRAFT_FOUNTAIN} from '../src/layout-preview/layout'
import {WalkwayMaterial} from '../src/world/art/WalkwayMaterial'
import {site,heightAt} from './plan'
import {gradeFountainCourses,renewalFountainTerrain} from './fountainAccessGeometry'

export const preservedFountainBenches=PARK_DATA.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-'))
export function PreservedFountain(){
 const root=useRef<Group>(null)
 useLayoutEffect(()=>{
  const meshes: {mesh:Mesh;source:Mesh['geometry']}[]=[]
  root.current?.getObjectByName('fountain-stone-courses')?.traverse(node=>{
   if(!(node instanceof Mesh))return
   const source=node.geometry
   node.geometry=gradeFountainCourses(source)
   meshes.push({mesh:node,source})
  })
  return ()=>{for(const {mesh,source} of meshes)mesh.geometry=source}
 },[])
 const s=site('fountain')
 return <group ref={root} name="preserved-fountain-complete-district" position={[s.x-ORIGINAL.fountain.x,heightAt(s.x,s.z),s.z-ORIGINAL.fountain.z]}>
  <mesh name="renewal-fountain-walkway" geometry={renewalFountainTerrain} dispose={null}><WalkwayMaterial color="#c4bfb1"/></mesh>
 <group position={[ORIGINAL.fountain.x,0,ORIGINAL.fountain.z]} scale={[DRAFT_FOUNTAIN.scale,1,DRAFT_FOUNTAIN.scale]}><group position={[-FOUNTAIN.x,0,-FOUNTAIN.z]}><ParkFountain quality="low" jetHeightScale={DRAFT_FOUNTAIN.jetHeightScale}/></group></group>
 {preservedFountainBenches.map(b=><ReferenceBench key={b.siteId} name={b.siteId} position={[...b.position]} yaw={b.yaw} horizontalScale={DRAFT_FOUNTAIN.scale} seatHeight={.56}/>)}
 </group>}
