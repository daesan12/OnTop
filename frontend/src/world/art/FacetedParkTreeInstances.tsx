import { SIMPLE_MAP } from './mapRenderProfile'
import {ConeGeometry,CylinderGeometry,IcosahedronGeometry,MeshStandardMaterial,MeshLambertMaterial} from 'three'
import {SpatialInstances,Instances} from './Instances'
import type {buildParkTreeParts} from './parkTreeParts'

// The original service map and preview share the exact meshes and flat material.
export const parkTreeResources={
  trunk:new CylinderGeometry(.52,1,1,SIMPLE_MAP?4:6,1,true),
  round:new IcosahedronGeometry(1,SIMPLE_MAP?0:1),
  cone:new ConeGeometry(1,2,8),
  material:SIMPLE_MAP?new MeshLambertMaterial({flatShading:true}):new MeshStandardMaterial({roughness:.94,flatShading:true}),
}

export function FacetedParkTreeInstances({parts,name,treeCount}:{parts:ReturnType<typeof buildParkTreeParts>;name:string;treeCount:number}){
  const Batch=SIMPLE_MAP?Instances:SpatialInstances
  return <group name={name} userData={{assetId:'park/faceted-trees',treeCount}}>
    {([{parts:parts.wood,geometry:parkTreeResources.trunk},{parts:parts.crowns,geometry:parkTreeResources.round},{parts:parts.cones,geometry:parkTreeResources.cone}]).map(({parts,geometry})=><Batch key={geometry.uuid} parts={parts} shadow={false} material={<primitive object={parkTreeResources.material} attach="material" dispose={null}/>}>
      <primitive object={geometry} attach="geometry" dispose={null}/>
    </Batch>)}
  </group>
}
