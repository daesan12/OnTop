import {useEffect,useMemo} from 'react'
import {AdditiveBlending,CatmullRomCurve3,TubeGeometry,Vector3} from 'three'
import {PropBuilder,type XYZ} from '../../../../../../../world/art/propGeometry.ts'

/** Wall-mounted and flush-floor lighting leaves the reserved cabinet bays clear. */
export function ArcadeNeon({width,depth}:{width:number;depth:number}){
 const art=useMemo(()=>{
  const core=new PropBuilder(),halo=new PropBuilder(),back=-depth/2+.48
  const strip=(points:XYZ[],color:string,radius=.035)=>{
   const curve=new CatmullRomCurve3(points.map(p=>new Vector3(...p)))
   core.add('paint',new TubeGeometry(curve,24,radius,8,false),color)
   halo.add('paint',new TubeGeometry(curve,24,radius*2.6,8,false),color)
  }
  strip([[-width/2+.5,5.65,back],[0,5.65,back],[width/2-.5,5.65,back]],'#f57aff')
  strip([[width/2-.48,5.65,-depth/2+.5],[width/2-.48,5.65,0],[width/2-.48,5.65,depth/2-.5]],'#72e9ff')
  for(const side of [-1,1]){
   strip([[side*6.42,3.91,back],[side*6.42,4.7,back],[side*6.42,5.48,back]],side<0?'#72e9ff':'#f57aff')
   strip([[side*1.58,.19,-.1],[side*1.58,.19,2.7],[side*1.58,.19,depth/2-.45]],side<0?'#72e9ff':'#f57aff',.023)
  }
  strip([[-6.42,5.48,back],[0,5.48,back],[6.42,5.48,back]],'#b99aff')
  strip([[-width/2+.5,1.4,back],[0,1.4,back],[width/2-.5,1.4,back]],'#72e9ff',.025)
  strip([[width/2-.48,1.4,-depth/2+.5],[width/2-.48,1.4,0],[width/2-.48,1.4,depth/2-.5]],'#f57aff',.025)
  // Flush floor grid: no furniture or collision is added to the spare bays.
  for(const x of [-7,-4,4,7])strip([[x,.168,-depth/2+.5],[x,.168,0],[x,.168,depth/2-.5]],'#597ac9',.012)
  for(const z of [-4.5,-1.5,4.5])strip([[-width/2+.5,.168,z],[0,.168,z],[width/2-.5,.168,z]],'#9760cb',.012)
  return {core:core.finish().paint!,halo:halo.finish().paint!}
 },[width,depth])
 useEffect(()=>()=>{art.core.dispose();art.halo.dispose()},[art])
 return <group name="arcade-interior-neon">
  <mesh geometry={art.core} dispose={null}><meshBasicMaterial vertexColors toneMapped={false}/></mesh>
  <mesh geometry={art.halo} dispose={null}><meshBasicMaterial vertexColors toneMapped={false} transparent opacity={.14} blending={AdditiveBlending} depthWrite={false}/></mesh>
 </group>
}
