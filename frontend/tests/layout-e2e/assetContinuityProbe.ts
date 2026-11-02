import {_roots} from '@react-three/fiber'
import type {Mesh} from 'three'
import {usePreviewBench,previewBenches} from '../../src/layout-preview/PreviewBench'
import {previewMotion} from '../../src/layout-preview/PreviewCamera'
import {SITES} from '../../src/layout-preview/layout'

export function assetContinuityProbe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
 const floor=scene.getObjectByName('fitness-zone-floor') as Mesh,vr=scene.getObjectByName('vr-hanok-model')!,folk=scene.getObjectByName('folk-hanok-model')!
 const vrParts=vr.children as Mesh[],folkParts=folk.children as Mesh[]
 return {floor:floor.userData,floorHasTexture:'map' in floor.material&&!!floor.material.map,
  sharedHallGeometry:vrParts.length===folkParts.length&&vrParts.every((m,n)=>m.geometry===folkParts[n]!.geometry),
  seated:usePreviewBench.getState().seated,position:{x:previewMotion.x,z:previewMotion.z},pitch:previewMotion.pitch}
}
export function approachAsset(kind:'vr'|'folk'|'bench'){
 if(kind==='bench'){
  const b=previewBenches.find(b=>b.siteId==='bench-forest-southwest')!
  usePreviewBench.setState({nearby:null,seated:null,poseRequest:{x:b.position[0]+Math.sin(b.yaw)*3.5,y:b.position[1]+.8,z:b.position[2]+Math.cos(b.yaw)*3.5,yaw:b.yaw}})
 }else{
  const s=SITES[kind]
  usePreviewBench.setState({nearby:null,seated:null,poseRequest:{x:s.x+16,y:.8,z:s.z,yaw:Math.PI/2}})
 }
}
export function assetReviewPitch(value:number){previewMotion.pitch=value}
