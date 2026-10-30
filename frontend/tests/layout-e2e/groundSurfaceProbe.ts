import {_roots} from '@react-three/fiber'
import {Raycaster,Vector2,type Mesh} from 'three'

export function fountainSurfaceRayAt(x:number,y:number){
 const canvas=document.querySelector('canvas')!,rect=canvas.getBoundingClientRect()
 const {scene,camera}=_roots.get(canvas)!.store.getState(),ray=new Raycaster()
 ray.setFromCamera(new Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),camera)
 // Check the repaired surface itself even when foreground foliage crosses the ray.
 // A missing collar still produces no hit at the former sky-gap pixel.
 return ray.intersectObject(scene.getObjectByName('layout-original-fountain-terrain')!,true).filter(hit=>{
  for(let p=hit.object;p;p=p.parent!)if(!p.visible)return false
  return true
 }).slice(0,8).map(hit=>({name:hit.object.name,parent:hit.object.parent?.name,point:hit.point.toArray(),material:((hit.object as Mesh).material as {type?:string})?.type}))
}
