import {Euler,Matrix4,Quaternion,SphereGeometry,TorusGeometry,Vector3} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {PARK_CAPSULES} from './gachaMachineGeometry'

export const CAPSULE_SCALE=.315
/** The exact previous poses; shared by the shell and its gold band/knob instance. */
export function capsuleTransform(index:number){
 const p=PARK_CAPSULES[index]!,rotation=new Euler(Math.sin(index*1.7)*.42,index*.79,Math.cos(index*1.3)*.42)
 return new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(rotation),new Vector3(CAPSULE_SCALE,CAPSULE_SCALE,CAPSULE_SCALE))
}
export function buildCapsuleBatchGeometry(){
 const shell=new SphereGeometry(1,24,16),band=new TorusGeometry(1.005,.04,8,32),knob=new SphereGeometry(.145,12,6)
 band.rotateX(Math.PI/2);knob.translate(0,1,0)
 const trim=mergeGeometries([band,knob])!;band.dispose();knob.dispose()
 return {shell,trim}
}
