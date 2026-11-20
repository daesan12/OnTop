import {useMemo} from 'react'
import {FacetedParkTreeInstances,parkTreeResources} from '../src/world/art/FacetedParkTreeInstances'
import {SpatialInstances} from '../src/world/art/Instances'
import {buildParkTreeParts} from '../src/world/art/parkTreeParts'
import {plantings,trees,treeCount} from './landscape'
import {isTreeBehindRenewalAdSign} from './live/advertisingPlacement'
import {WINTER_TREES_ENABLED,winterTreeParts} from '../src/features/winter/trees'
import {TreeSnowCaps} from '../src/features/winter/TreeSnowCaps'
import {winterFirFoliage} from '../src/features/winter/winterFirGeometry'

// Double the original 24 m grid while retaining frustum culling by sector.
const treeSectorSize=48
const useOriginalBatches=new URLSearchParams(window.location.search).get('tree-profile')==='before'
const treeBatches=(parts:typeof trees|ReturnType<typeof winterTreeParts>)=>[
 {parts:parts.wood,geometry:parkTreeResources.trunk},
 {parts:parts.crowns,geometry:parkTreeResources.round},
 {parts:parts.cones,geometry:'snowCones' in parts?winterFirFoliage:parkTreeResources.cone},
]
export function PreviewTreeBatches({ live = false }: { live?: boolean }){
 const {parts:visibleParts,count}=useMemo(()=>{
  if(!live)return {parts:WINTER_TREES_ENABLED?winterTreeParts(trees,plantings):trees,count:treeCount}
  const visible=plantings.filter(({position:[x,,z]})=>!isTreeBehindRenewalAdSign(x,z))
  return {parts:winterTreeParts(buildParkTreeParts(visible),visible),count:visible.length}
 },[live])
 if(useOriginalBatches)return <><FacetedParkTreeInstances parts={visibleParts} name="renewal-groves" treeCount={count}
  coneGeometry={'snowCones' in visibleParts?winterFirFoliage:undefined}/><TreeSnowCaps parts={visibleParts}/></>
 return <group name="renewal-groves" userData={{assetId:'park/faceted-trees',treeCount:count}}>
  {treeBatches(visibleParts).map(({parts,geometry})=>
   <SpatialInstances key={geometry.uuid} parts={parts} cellSize={treeSectorSize} shadow={false}
    material={<primitive object={parkTreeResources.material} attach="material" dispose={null}/>}>
    <primitive object={geometry} attach="geometry" dispose={null}/>
   </SpatialInstances>,
  )}
  <TreeSnowCaps parts={visibleParts}/>
 </group>
}
