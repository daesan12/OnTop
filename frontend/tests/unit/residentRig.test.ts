import {expect,it,vi} from 'vitest'
import {AnimationClip,Bone,BoxGeometry,Float32BufferAttribute,Group,MeshStandardMaterial,Skeleton,SkinnedMesh,Uint16BufferAttribute,Vector3} from 'three'
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js'
import {instantiateResident,residentBoneName,RESIDENT_LOOKS} from '../../src/features/ai/residentRig'

function fixture(){const scene=new Group(),hips=new Bone();hips.name='mixamorigHips';hips.position.y=1;scene.add(hips)
 const bones=[hips];for(const name of ['Spine','Spine2','Head','RightHandMiddle1','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftArm','RightArm','RightForeArm']){const bone=new Bone();bone.name='mixamorig'+name;hips.add(bone);bones.push(bone)}
 scene.getObjectByName('mixamorigHead')!.position.y=.65;scene.getObjectByName('mixamorigRightHandMiddle1')!.position.set(-.3,-.2,0)
 const geometry=new BoxGeometry(.4,2,.3).translate(0,1,0),count=geometry.getAttribute('position').count
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(new Array(count*4).fill(0),4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(Array.from({length:count*4},(_,i)=>i%4===0?1:0),4))
 const material=new MeshStandardMaterial(),mesh=new SkinnedMesh(geometry,material);scene.add(mesh);scene.updateMatrixWorld(true);mesh.bind(new Skeleton(bones));return {source:{scene,animations:[new AnimationClip('idle',1,[]),new AnimationClip('walk',1,[])]}as unknown as GLTF,geometry,material}
}
it('loads dedicated police and judge assets without modifying cooking customers',()=>{
 expect(RESIDENT_LOOKS.POLICE.id).toBe('police-officer')
 expect(RESIDENT_LOOKS.JUDGE.id).toBe('ajae-joker')
 for(const kind of ['POLICE','JUDGE'] as const){
  const {source,geometry,material}=fixture(),a=instantiateResident(source,kind),b=instantiateResident(source,kind)
  expect(residentBoneName('mixamorig:Head')).toBe(residentBoneName('mixamorigHead'))
  expect(a.bones.get('Head')).not.toBe(b.bones.get('Head'))
  expect(a.root.getObjectByName('police-cap')).toBeUndefined()
  expect(a.root.getObjectByName('police-baton')).toBeUndefined()
  const geometryDisposal=vi.spyOn(geometry,'dispose'),materialDisposal=vi.spyOn(material,'dispose')
  a.update(.016,2);a.dispose()
  expect(geometryDisposal).not.toHaveBeenCalled();expect(materialDisposal).not.toHaveBeenCalled()
  expect(geometry.index!.count).toBeGreaterThan(0)
  expect(source.scene.getObjectByName('mixamorigHead')!.position.y).toBe(.65)
  b.update(.016,0);b.dispose()
 }
})
it('seating and jump overlays restore the animated base instead of accumulating transforms',()=>{
 const actor=instantiateResident(fixture().source,'ELDER');actor.update(0,0,true)
 const first=actor.bones.get('LeftUpLeg')!.quaternion.clone(),position=actor.root.getObjectByName('mixamorigHips')!.getWorldPosition(new Vector3())
 expect(position.y).toBeCloseTo(.72)
 for(let i=0;i<100;i++)actor.update(0,0,true)
 expect(actor.bones.get('LeftUpLeg')!.quaternion.angleTo(first)).toBeLessThan(.000001)
 actor.update(0,0,false,true);actor.update(0,0,false,false)
 expect(actor.bones.get('LeftUpLeg')!.quaternion.angleTo(fixture().source.scene.getObjectByName('mixamorigLeftUpLeg')!.quaternion)).toBeLessThan(.000001)
 actor.dispose()
})
