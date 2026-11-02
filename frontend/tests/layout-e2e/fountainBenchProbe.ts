import { _roots } from '@react-three/fiber'
import { usePreviewBench,previewRingBenches } from '../../src/layout-preview/PreviewBench'
import { previewMotion } from '../../src/layout-preview/PreviewCamera'
import { PARK_LAYOUT } from '../../src/map/park'
import { parkTreeResources } from '../../src/world/art/FacetedParkTreeInstances'
import type { InstancedMesh } from 'three'

export function fountainBenchProbe(){
  const {scene,camera}=_roots.get(document.querySelector('canvas')!)!.store.getState()
  const state=usePreviewBench.getState()
  const bench=previewRingBenches.find(b=>b.id===state.seated?.benchId)
  const seat=bench?.seats[state.seated?.seatIndex??0]
  let treeShared=true
  scene.getObjectByName('layout-fitness-original-tree')!.traverse(o=>{
    const m=o as InstancedMesh
    if(m.isInstancedMesh)treeShared=treeShared&&[parkTreeResources.round,parkTreeResources.trunk,parkTreeResources.cone].includes(m.geometry as typeof parkTreeResources.trunk)&&m.material===parkTreeResources.material
  })
  return {nearby:state.nearby,seated:state.seated,position:[previewMotion.x,previewMotion.z],camera:camera.position.toArray(),
    treeShared,seat:seat?.use,exit:seat?.exit,walkable:PARK_LAYOUT.canWalk(previewMotion.x,previewMotion.z)}
}
