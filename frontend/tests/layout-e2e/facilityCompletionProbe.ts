import {_roots} from '@react-three/fiber'
import {Raycaster,Vector3} from 'three'
import {PARK_DATA} from '../../src/map/park'
import {previewMotion} from '../../src/layout-preview/PreviewCamera'
import {usePreviewBench} from '../../src/layout-preview/PreviewBench'

export function facilityCompletionProbe(){
  const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
  scene.updateMatrixWorld(true)
  const ray=new Raycaster()
  const benches=PARK_DATA.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-')||b.siteId.startsWith('bench-forest-')).map(b=>({
    id:b.id,exists:!!scene.getObjectByName(b.id),tops:b.seats.map(s=>{
      // A seat's contact patch spans the narrow gaps between timber slats.
      return Math.max(...[-.04,0,.04].flatMap(dz=>{
        ray.set(new Vector3(s.use.x,b.position[1]+.8,s.use.z+dz),new Vector3(0,-1,0))
        return ray.intersectObject(scene.getObjectByName(b.id)!,true).map(h=>h.point.y)
      }))
    }),expectedTop:b.position[1]+.56,
  }))
  return {benches,vrTables:['table-17','table-18'].map(id=>({id,exists:!!scene.getObjectByName(id)})),
    seated:usePreviewBench.getState().seated,position:[previewMotion.x,previewMotion.z]}
}
