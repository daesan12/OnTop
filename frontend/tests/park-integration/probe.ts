import {_roots} from '@react-three/fiber'
import {Vector3} from 'three'
import {useSession,avatars} from '../../src/network/worldClient'
import {interactWithTable} from '../../src/features/tableLobby/tableInteraction'
import {useFacilityState} from '../../src/features/facilities/state'
import {getParkInteraction} from '../../src/features/interactions/parkInteraction'
import {Raycaster} from 'three'
import {PARK_DATA} from '../../src/map/park'
import type {Mesh} from 'three'
export function sceneReady(){return !!_roots.get(document.querySelector('canvas')!)?.store.getState().scene.getObjectByName('park-service-map')}
export function renderedOwnPosition(){
 const scene=_roots.get(document.querySelector('canvas')!)?.store.getState().scene
 return scene?.getObjectByName('avatar-'+useSession.getState().sessionId)?.position.toArray()
}
export function detailProbe(){
 const {scene}=_roots.get(document.querySelector('canvas')!)!.store.getState()
 scene.updateMatrixWorld(true)
 const world=(name:string)=>scene.getObjectByName(name)?.getWorldPosition(new Vector3()).toArray()
 const paving:string[]=[],pavingTextures:string[]=[],advertisements:string[]=[]
 scene.traverse(o=>{
  if(/^(led-panel-|a-frame-|advertising-balloon$|park-advertising$|external-digital-sign$)/.test(o.name))advertisements.push(o.name)
  const mesh=o as Mesh;if(!mesh.isMesh)return
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m.userData.paving){
   paving.push(mesh.name||mesh.parent?.name||'unnamed')
   for(const [key,value] of Object.entries(m))if(value&&typeof value==='object'&&'isTexture' in value)pavingTextures.push(key)
  }
 })
 return {mailbox:world('feedback-mailbox'),board:world('tower-notes-mailbox'),boardExists:!!scene.getObjectByName('observatory-notes-board'),noteIds:scene.getObjectByName('observatory-user-notes')?.userData.noteIds??[],paving,pavingTextures,advertisements,backgroundBuildings:['west-media','east-media','north-media','west-poster-media','east-wide-media','north-landscape-media'].filter(n=>!!scene.getObjectByName(n))}
}
export function probe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene,s=useSession.getState()
 return {identity:scene.getObjectByName('park-service-map')?.userData,session:s,pose:avatars.get(s.sessionId)?.current,swimming:avatars.get(s.sessionId)?.swimming,facilities:useFacilityState.getState().ready,target:getParkInteraction(),tables:Array.from({length:18},(_,n)=>({id:'table-'+(n+1),position:scene.getObjectByName('table-'+(n+1))?.getWorldPosition(new Vector3()).toArray()})),mailbox:scene.getObjectByName('feedback-mailbox')?.getWorldPosition(new Vector3()).toArray()}
}
export const inspect=(id:string)=>interactWithTable(id)
export function renderedSeatHeights(id:string){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene,t=PARK_DATA.tables.find(t=>t.id===id)!,ray=new Raycaster(),object=scene.getObjectByName(id)!
 scene.updateMatrixWorld(true)
 return {count:object.userData.presentedSeatCount,heights:t.seatAnchors.map(([x,,z])=>{ray.set(new Vector3(t.position[0]+x,t.position[1]+.8,t.position[2]+z),new Vector3(0,-1,0));return ray.intersectObject(object,true)[0]?.point.y})}
}
