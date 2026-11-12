import {Bone,BoxGeometry,CanvasTexture,CylinderGeometry,Group,Mesh,MeshStandardMaterial,Quaternion,Shape,ExtrudeGeometry,SphereGeometry,TorusGeometry,Vector3,SRGBColorSpace} from 'three'
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js'
import {instantiateCustomerV5} from '../bungeoppang/customerModelV5'
import type {CustomerAssetV5} from '../bungeoppang/customerAssetsV5'
import {fitPoliceUniform} from './policeUniform'

export type ResidentKind='POLICE'|'CHILD'|'NEIGHBOR'|'ELDER'
export const residentBoneName=(name:string)=>name.replace(/^mixamorig[:_]?/,'')
export const RESIDENT_LOOKS:Record<ResidentKind,{id:CustomerAssetV5['id'];height:number}>={
 POLICE:{id:'worker-earmuffs',height:2.02},CHILD:{id:'boy-red-scarf',height:1.48},
 NEIGHBOR:{id:'woman-glasses-bun',height:1.94},ELDER:{id:'older-flat-cap',height:1.98},
}
/** Own skeleton/materials and bone-attached props; source GLBs and the cooking customers stay untouched. */
export function instantiateResident(source:GLTF,kind:ResidentKind) {
 const look=RESIDENT_LOOKS[kind],instance=instantiateCustomerV5(source,look),root=new Group()
 root.name='resident-model-'+kind;root.add(instance.root)
 const bones=new Map<string,Bone>();instance.root.traverse(o=>{if(o instanceof Bone)bones.set(residentBoneName(o.name),o)})
 const geometry=new Set<Mesh['geometry']>(),materials=new Set<MeshStandardMaterial>(),textures:CanvasTexture[]=[]
 const material=(color:string,metalness=0)=>{const m=new MeshStandardMaterial({color,roughness:metalness?.36:.78,metalness});materials.add(m);return m}
 const navy=material('#20354c'),dark=material('#142131'),gold=material('#d9b66b',.65),black=material('#23272c'),wood=material('#765137')
 function mesh(g:Mesh['geometry'],m:MeshStandardMaterial,p:[number,number,number],scale?:[number,number,number]) {
  geometry.add(g);const item=new Mesh(g,m);item.position.set(...p);if(scale)item.scale.set(...scale);item.castShadow=item.receiveShadow=true;return item
 }
 function attach(group:Group,boneName:string){root.add(group);root.updateMatrixWorld(true);bones.get(residentBoneName(boneName))?.attach(group)}
 const uniform=kind==='POLICE'?fitPoliceUniform(root,bones):null
 const point=new Vector3()
 if(kind==='POLICE') {
  const {head,neck,hips,chestY}=uniform!
  const cap=new Group();cap.name='police-cap'
  cap.add(mesh(new SphereGeometry(1,24,12),navy,[head.x,head.y+.29,head.z+.065],[.19,.08,.21]))
  cap.add(mesh(new CylinderGeometry(.182,.19,.035,28),dark,[head.x,head.y+.24,head.z+.05]))
  cap.add(mesh(new SphereGeometry(1,24,10),dark,[head.x,head.y+.23,head.z+.22],[.19,.018,.14]))
  cap.add(mesh(new CylinderGeometry(.035,.035,.014,6),gold,[head.x,head.y+.29,head.z+.27]))
  cap.children.at(-1)!.rotation.x=Math.PI/2;attach(cap,'Head')
  const vest=new Group()
  const shield=new Shape();shield.moveTo(-.045,.055);shield.lineTo(.045,.055);shield.lineTo(.038,-.017);shield.lineTo(0,-.06);shield.lineTo(-.038,-.017);shield.closePath()
  vest.add(mesh(new ExtrudeGeometry(shield,{depth:.009,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:2,steps:1}),gold,[hips.x-.10,chestY+.07,hips.z+.174]))
  for(const x of [-.19,.19])vest.add(mesh(new BoxGeometry(.065,.025,.075),gold,[hips.x+x,neck.y-.07,hips.z]))
  if(typeof document!=='undefined') {
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#20354c';ctx.fillRect(0,0,256,96);ctx.fillStyle='#f0eddc';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.fillText('경찰',128,69)
   const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;textures.push(texture)
   const label=new MeshStandardMaterial({map:texture,roughness:.8});materials.add(label)
   vest.add(mesh(new BoxGeometry(.14,.052,.006),label,[hips.x+.095,chestY+.07,hips.z+.174]))
  }
  attach(vest,'Spine2')
  const baton=new Group(),hand=bones.get('RightHandMiddle1')??bones.get('RightHand')
  root.updateMatrixWorld(true);if(hand)hand.getWorldPosition(point);root.worldToLocal(point);baton.position.copy(point)
  baton.add(mesh(new CylinderGeometry(.025,.025,.50,14),black,[0,-.21,0]))
  baton.add(mesh(new CylinderGeometry(.034,.034,.13,14),dark,[0,.015,0]))
  for(let i=0;i<5;i++)baton.add(mesh(new TorusGeometry(.034,.003,5,16),black,[0,-.035+i*.023,0]))
  for(const item of baton.children.slice(2))item.rotation.x=Math.PI/2
  baton.add(mesh(new SphereGeometry(.027,12,8),black,[0,-.46,0]));baton.name='police-baton';attach(baton,hand?.name.split(':').at(-1)??'RightHand')
 }
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
  dispose(){instance.dispose();uniform?.dispose();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent()},
 }
}
