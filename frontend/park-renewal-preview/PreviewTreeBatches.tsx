import {FacetedParkTreeInstances,parkTreeResources} from '../src/world/art/FacetedParkTreeInstances'
import {SpatialInstances} from '../src/world/art/Instances'
import {trees,treeCount} from './landscape'

// Double the original 24 m grid while retaining frustum culling by sector.
const treeSectorSize=48
const useOriginalBatches=new URLSearchParams(window.location.search).get('tree-profile')==='before'
const batches=[
 {parts:trees.wood,geometry:parkTreeResources.trunk},
 {parts:trees.crowns,geometry:parkTreeResources.round},
 {parts:trees.cones,geometry:parkTreeResources.cone},
]

export function PreviewTreeBatches(){
 if(useOriginalBatches)return <FacetedParkTreeInstances parts={trees} name="renewal-groves" treeCount={treeCount}/>
 return <group name="renewal-groves" userData={{assetId:'park/faceted-trees',treeCount}}>
  {batches.map(({parts,geometry})=>
   <SpatialInstances key={geometry.uuid} parts={parts} cellSize={treeSectorSize} shadow={false}
    material={<primitive object={parkTreeResources.material} attach="material" dispose={null}/>}>
    <primitive object={geometry} attach="geometry" dispose={null}/>
   </SpatialInstances>,
  )}
 </group>
}
