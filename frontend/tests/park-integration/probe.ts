import {_roots} from '@react-three/fiber'
import {Matrix4,Vector3,type InstancedMesh} from 'three'
import {useSession,avatars} from '../../src/network/worldClient'
import {interactWithTable} from '../../src/features/tableLobby/tableInteraction'
import {useFacilityState} from '../../src/features/facilities/state'
import {getParkInteraction} from '../../src/features/interactions/parkInteraction'
import {Raycaster} from 'three'
import {PARK_DATA} from '../../src/map/park'
import type {Mesh} from 'three'
import {GOMOKU} from '../../src/config'
import {omokCamera} from '../../src/game/cameraState'
import {fishBreadShopArt} from '../../src/world/art/luckyFacilityGeometry'
import {useParkDebris} from '../../src/features/parkDebris/state'
import {closeRankingBoard,useRankingBoardEntry} from '../../src/features/rankingBoard/model'

/** Tablet selection clears focusedAnchorId; inspect the actual seated board camera. */
export function omokPlayProbe(x=7,y=7){
 const state=_roots.get(document.querySelector('canvas')!)?.store.getState()
 const board=state?.scene.getObjectByName('omok-board-'+omokCamera.anchorId)
 if(!state||!board||!omokCamera.ready)return null
 const {camera,gl}=state,rect=gl.domElement.getBoundingClientRect()
 const point=board.localToWorld(new Vector3((x/14-.5)*GOMOKU.boardSpan,.019,(y/14-.5)*GOMOKU.boardSpan)).project(camera)
 return {position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),
  point:{x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2}}
}
export function sceneReady(){return !!_roots.get(document.querySelector('canvas')!)?.store.getState().scene.getObjectByName('park-service-map')}
export function fishShopMenuProbe(){
 const {scene}=_roots.get(document.querySelector('canvas')!)!.store.getState()
 const menu=scene.getObjectByName('fish-bread-shop-menu')!.children[0]!
 scene.updateMatrixWorld(true)
 const target=menu.getWorldPosition(new Vector3()),direction=menu.getWorldDirection(new Vector3())
 const ray=new Raycaster(target.clone().addScaledVector(direction,5),direction.negate(),0,6)
 const first=ray.intersectObject(scene.getObjectByName('fish-bread-shop-exterior')!,true)[0]
 return {localPosition:menu.position.toArray(),firstSurface:first?.object.name}
}
export function debrisRenderProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)?.store.getState().scene
 if(!scene)return []
 scene.updateMatrixWorld(true)
 return useParkDebris.getState().items.map(item=>{
  const root=scene.getObjectByName('park-debris-'+item.id),board=scene.getObjectByName('park-debris-board-'+item.id)
  const stones=scene.getObjectByName('park-debris-stones-'+item.id) as InstancedMesh|undefined
  const positions=stones?item.parts.filter(part=>part.startsWith('stone-')).map(part=>{
   const matrix=new Matrix4();stones.getMatrixAt(Number(part.slice(6)),matrix)
   return {part,position:new Vector3().setFromMatrixPosition(matrix).applyMatrix4(stones.matrixWorld).toArray()}
  }):[]
  return {id:item.id,parts:item.parts,settled:!!root?.userData.settled,visible:root?.visible,
   stones:positions,
   board:board?.getWorldPosition(new Vector3()).toArray(),sourceVisible:scene.getObjectByName('game-surface-'+item.anchorId)?.visible}
 })
}
export function fishShopLanternProbe(){
 const {scene}=_roots.get(document.querySelector('canvas')!)!.store.getState()
 const shop=scene.getObjectByName('fish-bread-shop-building')!
 const mesh=shop.children.find(o=>(o as Mesh).geometry===fishBreadShopArt.glow) as Mesh
 const material=mesh.material as import('three').MeshStandardMaterial
 return {emission:material.emissiveIntensity??0,emissive:!!material.emissive?.getHex()}
}
export function migrationFollowupsProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 const names:string[]=[];scene.traverse(o=>names.push(o.name))
 return {rails:names.filter(n=>/^pavilion-P\d-railings$/.test(n)),course:!!scene.getObjectByName('service-jump-course'),localCourse:!!scene.getObjectByName('layout-vr-jump-course'),
  clouds:names.filter(n=>n==='simple-shared-clouds'||n==='simple-sky-clouds'),lanterns:!!scene.getObjectByName('traditional-pavilion-lanterns'),
  birdModes:(scene.getObjectByName('park-pigeons')?.userData.birds??[]).map((b:{x:number;y:number;z:number;mode:string})=>({x:b.x,y:b.y,z:b.z,mode:b.mode}))}
}
export function renderedOwnPosition(){
 const scene=_roots.get(document.querySelector('canvas')!)?.store.getState().scene
 return scene?.getObjectByName('avatar-'+useSession.getState().sessionId)?.position.toArray()
}
export function cameraPosition(){return _roots.get(document.querySelector('canvas')!)!.store.getState().camera.position.toArray()}
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
 return {identity:scene.getObjectByName('park-service-map')?.userData,session:s,pose:avatars.get(s.sessionId)?.current,swimming:avatars.get(s.sessionId)?.swimming,facilities:useFacilityState.getState().ready,target:getParkInteraction(),rankingBoardOpen:useRankingBoardEntry.getState().open,tables:Array.from({length:18},(_,n)=>({id:'table-'+(n+1),position:scene.getObjectByName('table-'+(n+1))?.getWorldPosition(new Vector3()).toArray()})),mailbox:scene.getObjectByName('feedback-mailbox')?.getWorldPosition(new Vector3()).toArray()}
}
export const inspect=(id:string)=>interactWithTable(id)
export const resetRankingBoardEntry=()=>closeRankingBoard()
export function renderedSeatHeights(id:string){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene,t=PARK_DATA.tables.find(t=>t.id===id)!,ray=new Raycaster(),object=scene.getObjectByName(id)!
 scene.updateMatrixWorld(true)
 return {count:object.userData.presentedSeatCount,heights:t.seatAnchors.map(([x,,z])=>{ray.set(new Vector3(t.position[0]+x,t.position[1]+.8,t.position[2]+z),new Vector3(0,-1,0));return ray.intersectObject(object,true)[0]?.point.y})}
}
