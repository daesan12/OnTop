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
import {memoSlots,NOTES_BOARD_SCALE} from '../../src/world/art/notesBoardLayout'

export function notesBoardView(){
 const store=_roots.get(document.querySelector('canvas')!)!.store
 const [x,y,z]=PARK_DATA.interactions.notes.position
 store.getState().internal.subscribe({current:({camera})=>{
  camera.position.set(x+.5,y+2.4,z+6.5)
  camera.lookAt(x,y+1.7,z);camera.updateMatrixWorld()
 }},.5,store)
}
export function notesPaperVisible(){
 const {scene}=_roots.get(document.querySelector('canvas')!)!.store.getState()
 scene.updateMatrixWorld(true)
 const board=scene.getObjectByName('tower-notes-mailbox')!,slot=memoSlots[0]
 const target=board.localToWorld(new Vector3(slot.x,slot.y,.15))
 const ray=new Raycaster(target.clone().add(new Vector3(0,0,3)),new Vector3(0,0,-1),0,4)
 // LOD raycasts can include hidden levels; use the first visible mesh.
 const hit=ray.intersectObject(board,true).find(h=>{
  for(let node:import('three').Object3D|null=h.object;node;node=node.parent)if(!node.visible)return false
  return true
 })
 let paper=false
 for(let node:import('three').Object3D|null=hit?.object??null;node;node=node.parent)if(node.name==='observatory-user-notes')paper=true
 const material=(hit?.object as Mesh|undefined)?.material as import('three').MeshBasicMaterial|undefined
 return {paper,textured:!!material?.map,scale:board.scale.x,expectedScale:NOTES_BOARD_SCALE}
}

export function hallSignClearance(name:string){
 const {scene}=_roots.get(document.querySelector('canvas')!)!.store.getState()
 scene.updateMatrixWorld(true)
 const group=scene.getObjectByName(name)!,sign=group.children[0] as Mesh
 const forward=new Vector3(0,0,1).transformDirection(sign.matrixWorld),ray=new Raycaster()
 let visibleSamples=0
 for(const x of [-1.4,0,1.4])for(const y of [-.2,0,.2]){
  const point=sign.localToWorld(new Vector3(x,y,0))
  ray.set(point.clone().addScaledVector(forward,2),forward.clone().negate())
  if(ray.intersectObject(group.parent!,true)[0]?.object===sign)visibleSamples++
 }
 return {count:group.children.length,visibleSamples}
}
export function frameHallSign(name:string){
 const state=_roots.get(document.querySelector('canvas')!)!.store.getState()
 state.setFrameloop('never');state.scene.updateMatrixWorld(true)
 const sign=state.scene.getObjectByName(name)!.children[0]!
 const point=sign.getWorldPosition(new Vector3()),forward=new Vector3(0,0,1).transformDirection(sign.matrixWorld)
 state.camera.position.copy(point).addScaledVector(forward,5)
 state.camera.lookAt(point);state.camera.updateMatrixWorld(true)
 state.gl.render(state.scene,state.camera)
}

let releaseVrFrame:(()=>void)|undefined
export function frameVrEntrance(detail=false){
 releaseVrFrame?.()
 const store=_roots.get(document.querySelector('canvas')!)!.store,state=store.getState()
 state.scene.updateMatrixWorld(true)
 const marker=state.scene.getObjectByName('vr-entrance-marker')!
 const point=marker.getWorldPosition(new Vector3()),forward=new Vector3(0,0,1).transformDirection(marker.matrixWorld)
 const frame=()=>{
  state.camera.position.copy(point).addScaledVector(forward,detail?4.3:9).add(new Vector3(0,detail?6:3.4,0))
  state.camera.lookAt(point.clone().addScaledVector(forward,detail?0:-4));state.camera.updateMatrixWorld(true)
 }
 releaseVrFrame=state.internal.subscribe({current:frame},.5,store)
 frame()
 state.gl.render(state.scene,state.camera)
 return {position:point.toArray(),children:marker.children.length}
}

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
export function parkVisible(){
 const park=_roots.get(document.querySelector('canvas')!)?.store.getState().scene.getObjectByName('park-service-map')
 if(!park)return false
 for(let node:import('three').Object3D|null=park;node;node=node.parent)if(!node.visible)return false
 return true
}
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
export function preparedAssetVisible(name:string){
 const object=_roots.get(document.querySelector('canvas')!)?.store.getState().scene.getObjectByName(name)
 if(!object)return false
 for(let node:import('three').Object3D|null=object;node;node=node.parent)if(!node.visible)return false
 return true
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
 return {identity:scene.getObjectByName('park-service-map')?.userData,session:s,pose:avatars.get(s.sessionId)?.current,swimming:avatars.get(s.sessionId)?.swimming,facilities:useFacilityState.getState().ready,target:getParkInteraction(),rankingBoardOpen:useRankingBoardEntry.getState().open,tables:Array.from({length:18},(_,n)=>({id:'table-'+(n+1),position:scene.getObjectByName('table-'+(n+1))?.getWorldPosition(new Vector3()).toArray()})),mailbox:scene.getObjectByName('feedback-mailbox')?.getWorldPosition(new Vector3()).toArray()}
}
export const inspect=(id:string)=>interactWithTable(id)
export const resetRankingBoardEntry=()=>closeRankingBoard()
export function renderedSeatHeights(id:string){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene,t=PARK_DATA.tables.find(t=>t.id===id)!,ray=new Raycaster(),object=scene.getObjectByName(id)!
 scene.updateMatrixWorld(true)
 return {count:object.userData.presentedSeatCount,heights:t.seatAnchors.map(([x,,z])=>{ray.set(new Vector3(t.position[0]+x,t.position[1]+.8,t.position[2]+z),new Vector3(0,-1,0));return ray.intersectObject(object,true)[0]?.point.y})}
}
export function gameVisualProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)?.store.getState().scene
 const opening=scene?.getObjectByName('onecard-opening')
 const top=scene?.getObjectByName('onecard-public-top')
 return {opening:!!opening?.visible,phase:opening?.userData.phase,topRotation:top?.rotation.toArray().slice(0,3),
  counts:['101','102','103','104'].map(id=>(scene?.getObjectByName('onecard-held-cards-'+id) as InstancedMesh|undefined)?.count??0),
  debris:useParkDebris.getState().items.map(item=>{
   const root=scene?.getObjectByName('park-debris-'+item.id)
   const mesh=scene?.getObjectByName('park-debris-'+(item.gameCode==='OMOK'?'stones-':'pieces-')+item.id) as InstancedMesh|undefined
   const matrix=new Matrix4();mesh?.getMatrixAt(0,matrix)
   return {id:item.id,present:!!root,visible:!!root?.visible,pieces:mesh?.count??0,
    pieceHeight:new Vector3().setFromMatrixPosition(matrix).y,
    sourceVisible:scene?.getObjectByName('game-surface-'+item.anchorId)?.visible}
  })}
}
