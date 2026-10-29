import { SIMPLE_MAP } from './mapRenderProfile'
import { useEffect,useMemo } from 'react'
import { BufferGeometry,Float32BufferAttribute,type BufferAttribute } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BoundaryMasonry,MaksaeMaterial } from './BoundaryMaterial'
import { createWallRoof,WALL } from './boundaryGeometry'
import { SurfaceMaterial } from './SurfaceMaterial'

export function curvedWallCorners(half:number,radius:number) {
  const roof=createWallRoof(),clay:BufferGeometry[]=[],timber:BufferGeometry[]=[],ends:BufferGeometry[]=[]
  const body:number[]=[],foot:number[]=[]
  for(let corner=0;corner<4;corner++) {
    const center=[[1,1],[-1,1],[-1,-1],[1,-1]][corner]!,cx=center[0]!*(half-radius),cz=center[1]!*(half-radius)
    const at=(a:number,r:number,y:number)=>[cx+Math.cos(a)*r,y,cz+Math.sin(a)*r]
    const ribbon=(out:number[],r0:number,r1:number,y0:number,y1:number)=>{
      for(let i=0;i<(SIMPLE_MAP?12:64);i++) {
        const a=corner*Math.PI/2+i*Math.PI/(SIMPLE_MAP?24:128),b=a+Math.PI/(SIMPLE_MAP?24:128)
        const quad=(p:number[],q:number[],r:number[],s:number[])=>out.push(...p,...q,...r,...p,...r,...s)
        quad(at(a,r1,y0),at(a,r1,y1),at(b,r1,y1),at(b,r1,y0))
        quad(at(b,r0,y0),at(b,r0,y1),at(a,r0,y1),at(a,r0,y0))
        quad(at(a,r0,y1),at(b,r0,y1),at(b,r1,y1),at(a,r1,y1))
      }
    }
    ribbon(body,radius-WALL.depth/2,radius+WALL.depth/2,WALL.base,WALL.bodyTop)
    ribbon(foot,radius-.385,radius+.385,0,.24)
    const count=Math.ceil(radius*Math.PI/8)
    for(let n=0;n<count;n++)for(const [source,dest] of [[roof.clay,clay],[roof.timber,timber],[roof.ends,ends]] as const) {
      if(!source)continue
      const g=source.clone(),p=g.getAttribute('position') as BufferAttribute
      for(let i=0;i<p.count;i++) {
        const a=corner*Math.PI/2+(n+(p.getX(i)+2)/4)*Math.PI/2/count,r=radius-p.getZ(i)
        p.setXYZ(i,cx+Math.cos(a)*r,p.getY(i),cz+Math.sin(a)*r)
      }
      g.computeVertexNormals();dest.push(g)
    }
  }
  const mesh=(vertices:number[])=>{
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));g.computeVertexNormals();return g
  }
  const merge=(geometries:BufferGeometry[])=>{if(!geometries.length){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([],3));return g;}const result=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());return result}
  roof.clay.dispose();roof.timber.dispose();roof.ends?.dispose()
  return {body:mesh(body),foot:mesh(foot),clay:merge(clay),timber:merge(timber),ends:merge(ends)}
}

export function RoundedBoundaryCorners({half,radius}:{half:number;radius:number}) {
  const geometry=useMemo(()=>curvedWallCorners(half,radius),[half,radius])
  useEffect(()=>()=>Object.values(geometry).forEach(g=>g.dispose()),[geometry])
  return <group name="rounded-tiled-wall-corners">
    <mesh geometry={geometry.body}><BoundaryMasonry/></mesh>
    <mesh geometry={geometry.foot}><SurfaceMaterial kind="stone" mapping="box" color="#999b95"/></mesh>
    <mesh geometry={geometry.clay}><SurfaceMaterial kind="stone" vertexColors detail={.18} strength={.14}/></mesh>
    <mesh geometry={geometry.timber}><meshStandardMaterial vertexColors roughness={.96}/></mesh>
    {!SIMPLE_MAP&&<mesh geometry={geometry.ends}><MaksaeMaterial/></mesh>}
  </group>
}
