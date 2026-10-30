import {useEffect,useMemo} from 'react'
import {createFitnessPaving} from './fitnessPavingGeometry'
export function FitnessCourtPaving({area,color}:{area:{x:number;z:number;width:number;depth:number};color:string}) {
  const paving=useMemo(()=>createFitnessPaving(area.width,area.depth,color),[area.width,area.depth,color])
  useEffect(()=>()=>paving.geometry.dispose(),[paving])
  return <mesh name="fitness-zone-floor" position={[area.x,0,area.z]} geometry={paving.geometry} receiveShadow
    userData={{style:'low-poly-staggered-pavers',tileCount:paving.tileCount,triangles:paving.triangleCount,top:paving.top,textures:0}}>
    <meshLambertMaterial vertexColors flatShading/>
  </mesh>
}
