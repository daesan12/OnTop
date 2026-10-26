import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide,type Group } from 'three'
import { previewMotion } from './PreviewCamera'
import { DRAFT_LAKE } from './lakeLayout'

export function PreviewSwimmingRipples() {
  const root=useRef<Group>(null)
  useFrame(({clock})=>{
    const group=root.current;if(!group)return
    group.visible=previewMotion.mode==='walk'&&previewMotion.swimming
    if(!group.visible)return
    group.position.set(previewMotion.x,DRAFT_LAKE.surfaceY+.025,previewMotion.z)
    const scale=.9+Math.sin(clock.elapsedTime*3)*.1
    group.scale.setScalar(scale)
  })
  return <group ref={root} name="layout-swimming-ripples" visible={false}>
    {[.6,1,1.45].map(r=><mesh key={r} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[r,r+.035,48]}/><meshBasicMaterial color="#c3dfcf" transparent opacity={.45} side={DoubleSide} depthWrite={false}/></mesh>)}
  </group>
}
