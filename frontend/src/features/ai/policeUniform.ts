import {Bone,CylinderGeometry,Group,Mesh,MeshStandardMaterial,Quaternion,SkinnedMesh,SphereGeometry,Vector3} from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'

/** Keep the private clone's face/hands, replacing civilian clothing and earmuffs with bone-bound uniform parts. */
export function fitPoliceUniform(root:Group,bones:Map<string,Bone>) {
 const geometries=new Set<Mesh['geometry']>(),materials=new Set<MeshStandardMaterial>()
 const point=new Vector3(),head=new Vector3(),neck=new Vector3(),hips=new Vector3()
 root.updateMatrixWorld(true)
 const at=(name:string,fallback:Vector3)=>{const b=bones.get(name);return b?root.worldToLocal(b.getWorldPosition(new Vector3())):fallback.clone()}
 head.copy(at('Head',new Vector3(0,1.69,.07)));neck.copy(at('Neck',new Vector3(0,1.56,.02)));hips.copy(at('Hips',new Vector3(0,1.04,.08)))
 root.traverse(o=>{if(!(o instanceof SkinnedMesh))return
  const source=o.geometry,index=source.getIndex(),weights=source.getAttribute('skinWeight'),joints=source.getAttribute('skinIndex')
  if(!weights||!joints)return
  const skinned=o
  const keep=new Map<number,boolean>(),pose=new Vector3()
  function retained(i:number){if(keep.has(i))return keep.get(i)!
   let headWeight=0,handWeight=0
   for(let k=0;k<4;k++){const bone=skinned.skeleton.bones[joints.getComponent(i,k)]?.name??'',weight=weights.getComponent(i,k);if(/Head/.test(bone))headWeight+=weight;if(/Hand/.test(bone))handWeight+=weight}
   skinned.getVertexPosition(i,pose);skinned.localToWorld(pose);root.worldToLocal(pose)
   const dx=Math.abs(pose.x-head.x),ear=dx>.13&&pose.y>head.y-.09&&pose.y<head.y+.25&&pose.z<head.z+.22
   const band=pose.y>head.y+.25&&pose.z<head.z+.08
   const value=handWeight>.5||headWeight>.35&&pose.y>neck.y+.055&&!ear&&!band;keep.set(i,value);return value
  }
  const retainedIndices:number[]=[],count=index?.count??source.getAttribute('position').count
  for(let i=0;i+2<count;i+=3){const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;if(retained(a)&&retained(b)&&retained(c))retainedIndices.push(a,b,c)}
  const privateGeometry=source.clone();privateGeometry.setIndex(retainedIndices);privateGeometry.clearGroups();privateGeometry.addGroup(0,retainedIndices.length,0);geometries.add(privateGeometry);o.geometry=privateGeometry
 })
 const material=(color:string,metalness=0)=>{const m=new MeshStandardMaterial({color,metalness,roughness:metalness?.35:.76});materials.add(m);return m}
 const navy=material('#203a58'),pants=material('#172b43'),dark=material('#17222d'),skin=material('#e8bd9e'),gold=material('#c8b47b',.5),seam=material('#536c87')
 const yAxis=new Vector3(0,1,0),rotation=new Quaternion()
 function mesh(g:Mesh['geometry'],m:MeshStandardMaterial,p:Vector3){geometries.add(g);const item=new Mesh(g,m);item.position.copy(p);item.castShadow=item.receiveShadow=true;return item}
 function attach(group:Group,bone:string){root.add(group);root.updateMatrixWorld(true);bones.get(bone)?.attach(group)}
 function rounded(group:Group,m:MeshStandardMaterial,p:Vector3,size:[number,number,number],radius=.015){const item=mesh(new RoundedBoxGeometry(...size,2,radius),m,p);group.add(item);return item}
 const torso=new Group();torso.name='police-uniform'
 const neckSkin=mesh(new CylinderGeometry(.067,.075,.18,18),skin,new Vector3(neck.x,neck.y+.055,neck.z+.025));torso.add(neckSkin)
 const chestY=(hips.y+neck.y)/2,body=mesh(new CylinderGeometry(.223,.19,neck.y-hips.y-.025,24),navy,new Vector3(hips.x,chestY,hips.z));body.scale.z=.72;torso.add(body)
 rounded(torso,dark,new Vector3(hips.x,hips.y+.012,hips.z),[.405,.065,.30])
 rounded(torso,gold,new Vector3(hips.x,hips.y+.015,hips.z+.159),[.055,.045,.018],.007)
 for(const sign of [-1,1]) {
  rounded(torso,navy,new Vector3(hips.x+sign*.097,chestY+.055,hips.z+.154),[.13,.105,.018])
  rounded(torso,seam,new Vector3(hips.x+sign*.097,chestY+.103,hips.z+.167),[.14,.017,.012],.005)
  const collar=rounded(torso,navy,new Vector3(neck.x+sign*.065,neck.y-.015,neck.z+.07),[.075,.10,.05],.01);collar.rotation.z=sign*.35
 }
 rounded(torso,dark,new Vector3(hips.x+.22,hips.y-.01,hips.z),[.075,.16,.10])
 for(let i=0;i<4;i++)torso.add(mesh(new SphereGeometry(.008,8,6),gold,new Vector3(hips.x,chestY-.14+i*.075,hips.z+.157)))
 attach(torso,'Spine2')
 const pelvis=new Group();rounded(pelvis,pants,new Vector3(hips.x,hips.y-.055,hips.z),[.34,.15,.25]);attach(pelvis,'Hips')
 for(const side of ['Left','Right']) {
  for(const [start,end,radius,m]of [[side+'Arm',side+'ForeArm',.078,navy],[side+'ForeArm',side+'Hand',.063,navy],[side+'UpLeg',side+'Leg',.088,pants],[side+'Leg',side+'Foot',.071,pants]] as const) {
   if(!bones.has(start)||!bones.has(end))continue
   const a=at(start,point),b=at(end,point),delta=b.clone().sub(a),length=delta.length();if(length<.01)continue
   const segment=new Group(),item=mesh(new CylinderGeometry(radius,radius*.86,length+.035,18),m,a.clone().add(b).multiplyScalar(.5));item.quaternion.copy(rotation.setFromUnitVectors(yAxis,delta.normalize()));segment.add(item);attach(segment,start)
  }
  if(bones.has(side+'Foot')){const foot=at(side+'Foot',point),boot=new Group();rounded(boot,dark,new Vector3(foot.x,foot.y-.045,foot.z+.055),[.15,.15,.29],.04);rounded(boot,dark,new Vector3(foot.x,foot.y-.105,foot.z+.05),[.16,.035,.30],.012);attach(boot,side+'Foot')}
  for(const [joint,radius,m]of [[side+'Arm',.078,navy],[side+'ForeArm',.065,navy],[side+'Leg',.072,pants]] as const){if(!bones.has(joint))continue;const group=new Group();group.add(mesh(new SphereGeometry(radius,16,12),m,at(joint,point)));attach(group,joint)}
 }
 // Earmuffs share the original head mesh. Fill the exposed back of the head after cropping them.
 const ears=new Group(),hair=material('#493025')
 const skull=mesh(new SphereGeometry(1,24,18),skin,new Vector3(head.x,head.y+.115,head.z-.035));skull.scale.set(.145,.19,.10);ears.add(skull)
 const hairBack=mesh(new SphereGeometry(1,24,18),hair,new Vector3(head.x,head.y+.16,head.z-.045));hairBack.scale.set(.15,.20,.10);ears.add(hairBack)
 for(const sign of [-1,1]){
  const temple=mesh(new SphereGeometry(1,20,14),hair,new Vector3(head.x+sign*.116,head.y+.18,head.z+.065));temple.scale.set(.028,.105,.09);ears.add(temple)
  const ear=mesh(new SphereGeometry(1,14,10),skin,new Vector3(head.x+sign*.145,head.y+.07,head.z+.015));ear.scale.set(.026,.049,.025);ears.add(ear)
 }attach(ears,'Head')
 return {head,neck,hips,chestY,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
