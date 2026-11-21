import {lakeShore,lakeBed,island,islandShore,lamps,retaining} from './landscape'
import {heightAt,LAKE} from './plan'
import {ParkCurbs} from './ParkCurbs'
import {Water} from '../src/world/art/WaterGarden'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {lazy,Suspense} from 'react'
import {NightLighting} from '../src/world/NightLighting'
import type {QualityPreset} from '../src/config'

const lampposts=lamps.map(([x,z])=>[x,heightAt(x,z),z]as const)
const PreservedFitness=lazy(()=>import('./PreservedFitness').then(m=>({default:m.PreservedFitness})))
const PreservedFountain=lazy(()=>import('./PreservedFountain').then(m=>({default:m.PreservedFountain})))
const ParkLamps=lazy(()=>import('../src/world/art/ParkFurniture').then(m=>({default:m.ParkLamps})))

export function LakeSurface() {
 return <>
  <mesh geometry={lakeBed}><meshLambertMaterial color="#597c64"/></mesh>
  <mesh geometry={lakeShore}><meshLambertMaterial color="#b6b39b" side={2}/></mesh>
  <Water position={[LAKE.x,LAKE.y,LAKE.z]} radius={[LAKE.rx,LAKE.rz]}/>
  <mesh geometry={islandShore}><meshLambertMaterial color="#aeb18a"/></mesh><mesh geometry={island}><meshLambertMaterial color="#859a5d"/></mesh>
 </>
}

export function RetainingFace() {
 return (
  <mesh name="steep-bank-stone-retaining-faces" geometry={retaining} userData={{keepOpaque:true}}><ParkStoneMaterial large twoSided/></mesh>
 )
}

export function ParkPathLights({quality,geometryReady=true}: {quality?: QualityPreset;geometryReady?:boolean}) {
 return <>
  {geometryReady&&<Suspense fallback={null}><ParkLamps placements={lampposts}/></Suspense>}
  {quality&&<NightLighting quality={quality} placements={lampposts}/>}
 </>
}

export function EntranceLandscape({quality, showFitnessStations, detailsReady=true}: {quality: QualityPreset; showFitnessStations: boolean;detailsReady?:boolean}) {
 return <>
  <RetainingFace />
  <ParkCurbs />
  <LakeSurface />
  {detailsReady&&<Suspense fallback={null}><PreservedFitness showStations={showFitnessStations} /></Suspense>}
  {detailsReady&&<Suspense fallback={null}><PreservedFountain /></Suspense>}
  {/* Keep the light pool from the first frame so streaming lamp geometry does
      not change every exterior material's shader layout. */}
  <ParkPathLights quality={quality} geometryReady={detailsReady}/>
 </>
}
