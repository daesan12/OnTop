import {Bone,CylinderGeometry,Group,Mesh,MeshStandardMaterial,Quaternion,SphereGeometry,Vector3} from 'three'
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js'
import {instantiateCustomerV5} from '../bungeoppang/customerModelV5'
import type {CustomerModelIdV5} from '../bungeoppang/customerAssetsV5'

export type ResidentKind='POLICE'|'CHILD'|'NEIGHBOR'|'ELDER'|'JUDGE'
export const residentBoneName=(name:string)=>name.replace(/^mixamorig[:_]?/,'')
export const RESIDENT_LOOKS:Record<ResidentKind,{id:CustomerModelIdV5;height:number}>={
 POLICE:{id:'police-officer',height:2.02},JUDGE:{id:'ajae-joker',height:2.02},CHILD:{id:'boy-red-scarf',height:1.48},
 NEIGHBOR:{id:'woman-glasses-bun',height:1.94},ELDER:{id:'older-flat-cap',height:1.98},
}
/** Own skeleton/materials and bone-attached props; source GLBs and the cooking customers stay untouched. */
export function instantiateResident(source:GLTF,kind:ResidentKind) {
 const look=RESIDENT_LOOKS[kind],instance=instantiateCustomerV5(source,look),root=new Group()
 root.name='resident-model-'+kind;root.add(instance.root)
 const bones=new Map<string,Bone>();instance.root.traverse(o=>{if(o instanceof Bone)bones.set(residentBoneName(o.name),o)})
 const geometry=new Set<Mesh['geometry']>(),materials=new Set<MeshStandardMaterial>()
 const material=(color:string,metalness=0)=>{const m=new MeshStandardMaterial({color,roughness:metalness?.36:.78,metalness});materials.add(m);return m}
 const black=material('#23272c'),wood=material('#765137')
 function mesh(g:Mesh['geometry'],m:MeshStandardMaterial,p:[number,number,number],scale?:[number,number,number]) {
  geometry.add(g);const item=new Mesh(g,m);item.position.set(...p);if(scale)item.scale.set(...scale);item.castShadow=item.receiveShadow=true;return item
 }
 function attach(group:Group,boneName:string){root.add(group);root.updateMatrixWorld(true);bones.get(residentBoneName(boneName))?.attach(group)}
 const point=new Vector3()
 if(kind==='ELDER') {
  const cane=new Group(),hand=bones.get('RightHandMiddle1')??bones.get('RightHand')
  root.updateMatrixWorld(true);if(hand)hand.getWorldPosition(point);root.worldToLocal(point);cane.position.copy(point)
  cane.add(mesh(new CylinderGeometry(.022,.026,.74,12),wood,[0,-.35,.035]))
  cane.add(mesh(new SphereGeometry(1,14,8),wood,[0,.024,.035],[.07,.025,.035]))
  cane.add(mesh(new CylinderGeometry(.029,.029,.04,12),black,[0,-.73,.035]));cane.name='elder-cane';attach(cane,hand?.name.split(':').at(-1)??'RightHand')
 }
 const changed=['Hips','Spine','Head','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftArm','RightArm','RightForeArm']
 const base=new Map<string,{q:Quaternion;p:Vector3}>()
 for(const name of changed){const b=bones.get(name);if(b)base.set(name,{q:b.quaternion.clone(),p:b.position.clone()})}
 const axis=new Vector3(),rotation=new Quaternion(),parentQ=new Quaternion(),worldQ=new Quaternion()
 function bend(name:string,radians:number){const bone=bones.get(name);if(!bone?.parent)return;root.updateMatrixWorld(true);axis.set(1,0,0).applyQuaternion(root.getWorldQuaternion(worldQ)).applyQuaternion(bone.parent.getWorldQuaternion(parentQ).invert());bone.quaternion.premultiply(rotation.setFromAxisAngle(axis,radians))}
 return {root,mixer:instance.mixer,bones,
  update(delta:number,speed:number,seated=false,airborne=false,talking=false) {
   instance.root.position.y=0
   for(const [name,pose]of base){const b=bones.get(name)!;b.quaternion.copy(pose.q);b.position.copy(pose.p)}
   const moving=!seated&&!airborne&&speed>.12;instance.play(moving?'walk':'idle')
   instance.mixer.timeScale=moving?Math.max(.65,Math.min(2.1,speed/1.65)):1
   instance.update(delta,0,1)
   for(const [name,pose]of base){const b=bones.get(name)!;pose.q.copy(b.quaternion);pose.p.copy(b.position)}
   if(seated&&bones.get('Hips')){root.updateMatrixWorld(true);bones.get('Hips')!.getWorldPosition(point);root.worldToLocal(point);instance.root.position.y=.72-point.y}
   if(seated){bend('LeftUpLeg',-1.35);bend('RightUpLeg',-1.35);bend('LeftLeg',1.45);bend('RightLeg',1.45);bend('Spine',.10)}
   else if(airborne){bend('LeftUpLeg',-.5);bend('RightUpLeg',-.35);bend('LeftLeg',.7);bend('RightLeg',.55);bend('Spine',.10)}
   else if(speed>3) {bend('Spine',.12);bend('RightForeArm',-.35)}
   if(talking)bend('Head',Math.sin(instance.mixer.time*3)*.035)
   root.updateMatrixWorld(true)
  },
  dispose(){instance.dispose();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent()},
 }
}
