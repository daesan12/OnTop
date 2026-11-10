import {BoxGeometry,BufferGeometry,Float32BufferAttribute} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {createWallRoof,WALL} from '../world/art/boundaryGeometry'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {PropModel} from '../world/art/PropModel'
import {mainGateArt} from '../layout-preview/reviewFurnitureGeometry'
import {plazaArt} from '../layout-preview/landscapeGeometry'
import {MAIN_GATE,LIFE_PLAZA} from '../layout-preview/layout'
import type {PropFinish} from '../world/art/propGeometry'
import {WalkwayMaterial} from '../world/art/WalkwayMaterial'
import {PropBuilder} from '../world/art/propGeometry'
import {PropSign} from '../world/art/CraftedProp'
import {GATE,WALL_RUNS,BOUNDARY_LENGTH,boundaryAtDistance} from './boundaryPlan'
import {heightAt,site,PLAZA_RADIUS} from './plan'

/** Bend the original four-metre prefab along the new outline, preserving its handedness. */
function bend(source:BufferGeometry,start:number,end:number){
 const g=source.clone(),p=g.getAttribute('position')
 for(let i=0;i<p.count;i++){
  const frame=boundaryAtDistance(start+(p.getX(i)+2)/4*(end-start)),depth=p.getZ(i)
  p.setXYZ(i,frame.x-frame.nx*depth,frame.y+p.getY(i)*1.22,frame.z-frame.nz*depth)
 }
 g.computeVertexNormals();return g
}
function repeat(source:BufferGeometry){const pieces=WALL_RUNS.map(run=>bend(source,run.start,run.end)),g=mergeGeometries(pieces)!;pieces.forEach(p=>p.dispose());source.dispose();g.computeBoundingSphere();return g}
const roof=createWallRoof(false)
export const wall={
 body:repeat(new BoxGeometry(4,WALL.bodyTop-WALL.base,WALL.depth,4,1,1).translate(0,(WALL.base+WALL.bodyTop)/2,0)),
 foot:repeat(new BoxGeometry(4,WALL.base+.4,WALL.depth*1.1,4,1,1).translate(0,(WALL.base-.4)/2,0)),
 clay:repeat(roof.clay),timber:repeat(roof.timber),
}
const gate=Object.fromEntries(Object.entries(mainGateArt).map(([kind,g])=>[kind,g.clone().translate(0,0,-MAIN_GATE.z)])) as Partial<Record<PropFinish,BufferGeometry>>
export const piers=(()=>{const b=new PropBuilder([5,3]);for(let d=GATE.opening/2+1;d<BOUNDARY_LENGTH-GATE.opening/2;d+=12){const f=boundaryAtDistance(d);b.box('stone','#aaa99b',[f.x,f.y+.85,f.z],[.64,2.1,.82],[0,f.yaw,0]);b.box('stone','#bfb8a7',[f.x,f.y+1.96,f.z],[.8,.16,.98],[0,f.yaw,0])}return b.finish()})()
function gateName(c:CanvasRenderingContext2D,w:number,h:number){c.fillStyle='#294a3b';c.fillRect(0,0,w,h);c.strokeStyle='#c3a86c';c.lineWidth=8;c.strokeRect(7,7,w-14,h-14);c.fillStyle='#f0e5c7';c.font=`700 ${h*.61}px "Malgun Gothic",sans-serif`;c.textBaseline='middle';c.textAlign='center';c.fillText('온탑공원',w/2,h/2,w*.83)}
// Keep the original circular plaza and inlays, excluding its old entrance avenue.
const plaza=Object.fromEntries(Object.entries(plazaArt).map(([kind,source])=>{
 const g=source.clone(),p=g.getAttribute('position'),index=g.getIndex(),kept:number[]=[]
 const at=(i:number)=>index?index.getX(i):i,count=index?.count??p.count
 for(let i=0;i<count;i+=3){const ids=[at(i),at(i+1),at(i+2)];if(ids.every(n=>Math.hypot(p.getX(n)-LIFE_PLAZA.x,p.getZ(n)-LIFE_PLAZA.z)<LIFE_PLAZA.pavingRadius+.02))kept.push(...ids)}
 g.setIndex(kept);g.translate(-LIFE_PLAZA.x,0,-LIFE_PLAZA.z);g.scale(PLAZA_RADIUS/LIFE_PLAZA.pavingRadius,1,PLAZA_RADIUS/LIFE_PLAZA.pavingRadius);g.translate(site('plaza').x,heightAt(site('plaza').x,site('plaza').z),site('plaza').z);g.computeBoundingSphere();return [kind,g]
})) as Partial<Record<PropFinish,BufferGeometry>>
const apron=(()=>{
 const positions:number[]=[],indices:number[]=[]
 for(let i=0;i<=8;i++)for(const offset of[0,3.1]){const arc=-3.6+i*.9,frame=boundaryAtDistance(arc<0?BOUNDARY_LENGTH+arc:arc);positions.push(frame.x+frame.nx*offset,GATE.y,frame.z+frame.nz*offset)}
 for(let i=0;i<8;i++){const k=i*2;indices.push(k,k+2,k+1,k+2,k+3,k+1)}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g
})()

export function OriginalPlaza(){return <PropModel art={plaza} name="retained-circular-stone-plaza" shadow={false}/>}
export function ParkBoundary(){return <group name="retained-tiled-wall-and-main-gate">
 <mesh geometry={wall.body} receiveShadow><ParkStoneMaterial/></mesh>
 <mesh geometry={wall.foot} receiveShadow><meshLambertMaterial color="#999b95"/></mesh>
 <mesh geometry={wall.clay}><meshLambertMaterial vertexColors flatShading/></mesh>
 <mesh geometry={wall.timber}><meshLambertMaterial vertexColors flatShading/></mesh>
 <PropModel art={piers} name="tiled-wall-stone-piers"/>
 <group position={[GATE.x,GATE.y,GATE.z]} rotation={[0,GATE.yaw,0]}><PropModel art={gate} name="retained-original-main-gate"/><PropSign draw={gateName} position={[0,4.06,.55]} width={3.2} height={.59}/></group>
 <mesh geometry={apron} receiveShadow><WalkwayMaterial color="#ffffff"/></mesh>
 </group>}
