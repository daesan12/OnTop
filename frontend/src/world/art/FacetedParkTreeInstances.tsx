import { SIMPLE_MAP } from './mapRenderProfile'
import { useMemo } from 'react'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import {ConeGeometry,CylinderGeometry,IcosahedronGeometry,MeshStandardMaterial,MeshLambertMaterial,type BufferGeometry} from 'three'
import {SpatialInstances,Instances} from './Instances'
import type {buildParkTreeParts} from './parkTreeParts'

// The original service map and preview share the exact meshes and flat material.
export const parkTreeResources={
  trunk:new CylinderGeometry(.52,1,1,SIMPLE_MAP?4:6,1,true),
  round:new IcosahedronGeometry(1,SIMPLE_MAP?0:1),
  cone:new ConeGeometry(1,2,8),
  material:SIMPLE_MAP?new MeshLambertMaterial({flatShading:true}):new MeshStandardMaterial({roughness:.94,flatShading:true}),
}

export function FacetedParkTreeInstances({parts,name,treeCount,coneGeometry=parkTreeResources.cone}:{parts:ReturnType<typeof buildParkTreeParts>;name:string;treeCount:number;coneGeometry?:BufferGeometry}){
  const Batch=SIMPLE_MAP?Instances:SpatialInstances
  const batches=useMemo(()=>[
    {parts:parts.wood,geometry:parkTreeResources.trunk},
    {parts:parts.crowns,geometry:parkTreeResources.round},
    {parts:parts.cones,geometry:coneGeometry},
  ],[parts,coneGeometry])
  return <group name={name} userData={{assetId:'park/faceted-trees',treeCount}}>
    {batches.map(({parts,geometry})=>GENERATED_PARK_ENABLED?<SpatialInstances key={geometry.uuid} parts={parts} cellSize={96} shadow={false} material={<primitive object={parkTreeResources.material} attach="material" dispose={null}/>}>
      <primitive object={geometry} attach="geometry" dispose={null}/>
    </SpatialInstances>:<Batch key={geometry.uuid} parts={parts} shadow={false} material={<primitive object={parkTreeResources.material} attach="material" dispose={null}/>}>
      <primitive object={geometry} attach="geometry" dispose={null}/>
    </Batch>)}
  </group>
}
