import {BufferGeometry,Float32BufferAttribute} from 'three'
import {terrain,paving,forestTrailMeshes,perimeterPoints} from './landscape'
import {BRIDGE,heightAt,LAKE,site,STATION_STEPS} from './plan'
import {PreviewPathMaterial} from './PreviewPathMaterial'

function terrainUnderStructure(x0:number,x1At:(z:number)=>number,z0:number,z1:number){
 const positions:number[]=[],colors:number[]=[],indices:number[]=[]
 const columns=Math.ceil((x1At((z0+z1)/2)-x0)/.25),rows=Math.ceil((z1-z0)/.25)
 for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const z=z0+(z1-z0)*row/rows,x=x0+(x1At(z)-x0)*column/columns
  const tone=.68+.035*Math.sin(x*.37+z*.29)
  positions.push(x,heightAt(x,z)+.068,z)
  colors.push(tone*.69,tone*.87,tone*.48)
  if(row&&column){
   const i=row*(columns+1)+column
   indices.push(i-columns-2,i-1,i-columns-1,i-columns-1,i-1,i)
  }
 }
 const g=new BufferGeometry()
 g.setAttribute('position',new Float32BufferAttribute(positions,3))
 g.setAttribute('color',new Float32BufferAttribute(colors,3))
 g.setIndex(indices)
 g.computeVertexNormals()
 return g
}
const balloon=site('balloon')
// Follow the existing curved stone bank, ending on the grass side of its crest.
const westBankGrassEdge=(z:number)=>LAKE.x-(LAKE.rx+.025)*Math.sqrt(1-((z-LAKE.z)/(LAKE.rz+.02))**2)
const supportGround=[
 terrainUnderStructure(BRIDGE.x0-.24,westBankGrassEdge,BRIDGE.z-BRIDGE.width/2-.09,BRIDGE.z+BRIDGE.width/2+.09),
 terrainUnderStructure(balloon.x-STATION_STEPS.halfX-.08,()=>balloon.x+STATION_STEPS.halfX+.08,
  balloon.z+STATION_STEPS.z0-.1,balloon.z+STATION_STEPS.z1+.08),
]
const boundaryGeometry=(()=>{const points=perimeterPoints(),p:number[]=[],indices:number[]=[];points.forEach(v=>p.push(v.x,v.y,v.z,v.x,-4,v.z));for(let i=0;i<points.length-1;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g})()
export function ScenicGround(){
 return <>
  <mesh geometry={boundaryGeometry} receiveShadow><meshLambertMaterial color="#9caa83" side={2}/></mesh>
  <mesh position={[0,-4.1,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2000,2000]}/><meshLambertMaterial color="#e8e8da"/></mesh>
  <mesh geometry={terrain} receiveShadow><meshLambertMaterial vertexColors/></mesh>
  {supportGround.map((geometry,index)=><mesh key={index} geometry={geometry} receiveShadow><meshLambertMaterial vertexColors/></mesh>)}
  <mesh geometry={paving} receiveShadow><PreviewPathMaterial/></mesh>
  {forestTrailMeshes.map(t=><mesh key={t.id} name={t.id} geometry={t.geometry}><meshLambertMaterial color="#acaa84"/></mesh>)}
 </>
}
