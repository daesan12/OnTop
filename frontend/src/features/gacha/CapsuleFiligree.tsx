import {useMemo} from 'react'
import {CatmullRomCurve3, Vector3} from 'three'

/** Embossed curls sit on the curved lacquer surface, rather than a flat decal. */
export function CapsuleFiligree({upper=false}:{upper?:boolean}){
 const curls=useMemo(()=>[-1,1].flatMap(side=>[-.45,.05].map(offset=>new CatmullRomCurve3(Array.from({length:40},(_,i)=>{
  const t=i/39*Math.PI*2.1,r=.12*(1-i/48),x=side*(.32+Math.cos(t)*r)+offset*.18,y=(upper?.38:-.4)+Math.sin(t)*r+offset*.12
  return new Vector3(x,y,Math.sqrt(Math.max(.01,1-x*x-y*y))+.012)
 })))) , [upper])
 return <group>
  {curls.map((curve,i)=><mesh key={i}><tubeGeometry args={[curve,40,.012,6,false]}/><meshStandardMaterial color="#f5c967" metalness={.7} roughness={.24}/></mesh>)}
  <group position={[0,upper?.38:-.39,upper?.94:.93]}>
   {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*Math.PI*2/5)*.14,Math.cos(i*Math.PI*2/5)*.14,0]} rotation={[0,0,-i*Math.PI*2/5]} scale={[.08,.13,.045]}><sphereGeometry args={[1,16,12]}/><meshStandardMaterial color="#f1c56e" metalness={.65} roughness={.25}/></mesh>)}
   <mesh position={[0,0,.045]}><sphereGeometry args={[.08,20,12]}/><meshStandardMaterial color="#ffdb80" metalness={.5} roughness={.17}/></mesh>
  </group>
 </group>
}
