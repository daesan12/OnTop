import { SIMPLE_MAP } from './mapRenderProfile'
import { useEffect,useMemo } from 'react'
import { DoubleSide } from 'three'
import { Instances,type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { UrbanMaterial } from './UrbanMaterials'
import { NightMaterial } from '../NightLighting'
import { outlineRing,roundedSquare } from './roundedOutline'

type StreetParts={paving:Part[];stone:Part[];paint:Part[];metal:Part[];round:Part[];lights:Part[]}
export function RoundedCityStreets({parkSize,radius,parts}:{parkSize:number;radius:number;parts:StreetParts}) {
  const geometry=useMemo(()=>{
    const half=parkSize/2, ring=(a:number,b:number,y:number)=>outlineRing(roundedSquare(half+a,radius+a,32,1),roundedSquare(half+b,radius+b,32,1),y)
    return {road:ring(4.6,18,-.005),innerWalk:ring(0,4.6,.105),outerWalk:ring(18,25,.105),
      innerCurb:ring(4.48,4.72,.195),outerCurb:ring(17.88,18.12,.195)}
  },[parkSize,radius])
  const markings=useMemo(()=>{
    const list:Part[]=parts.paint.filter(p=>p.p[1]>.5 || Math.max(...p.s)<6 && Math.min(p.s[0],p.s[2])>.2)
    const half=parkSize/2
    // Continuous tangent curves through each corner; keep the existing crossings open.
    for(const [offset,width,dashed,color] of [[11.17,.1,false,'#d5ac45'],[11.43,.1,false,'#d5ac45'],[5.05,.1,false,'#c6c8bc'],[17.55,.1,false,'#c6c8bc'],[8,.11,true,'#e8e5d9'],[14.6,.11,true,'#e8e5d9']] as const) {
      const points=roundedSquare(half+offset,radius+offset,SIMPLE_MAP?12:96,1)
      let distance=0
      for(let i=0;i<points.length;i++) {
        const a=points[i]!,b=points[(i+1)%points.length]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.ceil(length/(SIMPLE_MAP?(dashed?3:12):.5))
        for(let k=0;k<n;k++) {
          const t=(k+.5)/n,x=a[0]+dx*t,z=a[1]+dz*t,d=distance+length*t
          if(Math.min(Math.abs(x),Math.abs(z))<6 || dashed&&d%6>3)continue
          list.push({p:[x,.012,z],s:[width,.012,length/n+.008],r:[0,Math.atan2(dx,dz),0],c:color})
        }
        distance+=length
      }
    }
    return list
  },[parkSize,radius,parts])
  useEffect(()=>()=>Object.values(geometry).forEach(g=>g.dispose()),[geometry])
  // Drain grilles at the old square corner are omitted; poles, signals and lamps remain original.
  const awayFromCorners=(p:Part)=>Math.min(Math.abs(p.p[0]),Math.abs(p.p[2]))<parkSize/2-radius-1
  return <group name="rounded-city-streets">
    <mesh name="city-continuous-asphalt" geometry={geometry.road} receiveShadow><UrbanMaterial kind="asphalt" color="#656c6c"/></mesh>
    {[geometry.innerWalk,geometry.outerWalk].map((g,i)=><mesh key={i} geometry={g} receiveShadow><SurfaceMaterial kind="stone" mapping="box" color="#bbb9ad" paving meters={1.4} side={DoubleSide}/></mesh>)}
    {[geometry.innerCurb,geometry.outerCurb].map((g,i)=><mesh key={i} geometry={g}><SurfaceMaterial kind="stone" color="#c8c5b9" mapping="box" side={DoubleSide}/></mesh>)}
    <Instances parts={parts.paving.filter(p=>Math.max(...p.s)<6 && (!SIMPLE_MAP || Math.max(...p.s)>1))} shadow={false}><boxGeometry/></Instances>
    <Instances parts={parts.stone.filter(p=>Math.max(...p.s)<1&&awayFromCorners(p))} shadow={false}><boxGeometry/></Instances>
    <Instances parts={markings} shadow={false}><boxGeometry/></Instances>
    <Instances parts={parts.metal.filter(awayFromCorners)} shadow={false} material={<meshStandardMaterial roughness={.65} metalness={.4}/>}><boxGeometry/></Instances>
    <Instances parts={parts.round} shadow={false}><cylinderGeometry args={[1,1,1,SIMPLE_MAP?6:16]}/></Instances>
    <Instances parts={parts.lights} shadow={false} material={<NightMaterial strength={.6}/>}><boxGeometry/></Instances>
  </group>
}
