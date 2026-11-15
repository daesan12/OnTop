import {FacetedParkTreeInstances,parkTreeResources} from '../src/world/art/FacetedParkTreeInstances'
import {SpatialInstances} from '../src/world/art/Instances'
import {buildParkTreeParts} from '../src/world/art/parkTreeParts'
import {plantings,trees,treeCount} from './landscape'
import {isTreeBehindRenewalAdSign} from './live/advertisingPlacement'

// Double the original 24 m grid while retaining frustum culling by sector.
const treeSectorSize=48
const useOriginalBatches=new URLSearchParams(window.location.search).get('tree-profile')==='before'
const treeBatches=(parts:typeof trees)=>[
 {parts:parts.wood,geometry:parkTreeResources.trunk},
 {parts:parts.crowns,geometry:parkTreeResources.round},
 {parts:parts.cones,geometry:parkTreeResources.cone},
]
let liveTrees: { parts:typeof trees; count:number }|undefined
function getLiveTrees(){
 if(liveTrees)return liveTrees
 const visible=plantings.filter(({position:[x,,z]})=>!isTreeBehindRenewalAdSign(x,z))
 return liveTrees={parts:buildParkTreeParts(visible),count:visible.length}
}

export function PreviewTreeBatches({ live = false }: { live?: boolean }){
 const {parts:visibleParts,count}=live?getLiveTrees():{parts:trees,count:treeCount}
 if(useOriginalBatches)return <FacetedParkTreeInstances parts={visibleParts} name="renewal-groves" treeCount={count}/>
 return <group name="renewal-groves" userData={{assetId:'park/faceted-trees',treeCount:count}}>
  {treeBatches(visibleParts).map(({parts,geometry})=>
   <SpatialInstances key={geometry.uuid} parts={parts} cellSize={treeSectorSize} shadow={false}
    material={<primitive object={parkTreeResources.material} attach="material" dispose={null}/>}>
    <primitive object={geometry} attach="geometry" dispose={null}/>
   </SpatialInstances>,
  )}
 </group>
}
