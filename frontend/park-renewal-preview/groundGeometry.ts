import {staticPark} from './static/store'
import {BufferGeometry,Float32BufferAttribute} from 'three'
import {forestHeightAt,lakeWalkHeight,type Point} from './plan.ts'
import {groundPieces,clipGroundPolygon,FLOOR_Y_OFFSET} from './groundPlan.ts'
import {inSummit,SUMMIT_HEIGHT} from './hybridTerrainPlan.ts'
import {HORROR_PORTALS} from './horrorPlan.ts'
import {SUMMIT_WALL_FACE_OFFSET,summitWalls} from './summitWalls.ts'
import {RETAINING_FOOTING_Y} from './siteFinishingPlan.ts'

/** Split the height discontinuity exactly; never stretch terrain triangles across a wall. */
export function createParkGround(){
 const positions:number[]=[],grassColors:number[]=[],pavingColors:number[]=[],grassIndices:number[]=[],pavingIndices:number[]=[],vertices=new Map<string,number>()
 const vertex=([x,z]:Point,top:boolean)=>{
  const key=x.toFixed(5)+':'+z.toFixed(5)+':'+(top?'top':'forest'),old=vertices.get(key);if(old!==undefined)return old
  const y=(top?SUMMIT_HEIGHT:forestHeightAt(x,z))+FLOOR_Y_OFFSET
  const id=positions.length/3;vertices.set(key,id);positions.push(x,y,z)
  const tone=.68+.035*Math.sin(x*.37+z*.29);grassColors.push(tone*.69,tone*.87,tone*.48);pavingColors.push(1,1,1);return id
 }
 const add=(polygon:readonly Point[],indices:number[],top:boolean)=>{if(polygon.length<3)return;const ids=polygon.map(p=>vertex(p,top));for(let i=1;i<ids.length-1;i++)indices.push(ids[0]!,ids[i]!,ids[i+1]!)}
 const step=.5
 for(let xx=-122;xx<122;xx+=step)for(let zz=-126;zz<126;zz+=step)for(const triangle of [[[xx,zz],[xx,zz+step],[xx+step,zz]],[[xx+step,zz],[xx,zz+step],[xx+step,zz+step]]] as Point[][]){
   const pieces=groundPieces(triangle)
   for(const [polygon,index]of[[pieces.grass,grassIndices],[pieces.paving,pavingIndices]]as const){add(clipGroundPolygon(polygon,inSummit),index,true);add(clipGroundPolygon(polygon,(x,z)=>!inSummit(x,z)),index,false)}
 }
 // Clip grass back from both sides of the retaining wall. The masonry face owns the corner.
 const position=new Float32BufferAttribute(positions,3)
 const mesh=(indices:number[],colors:number[])=>{const g=new BufferGeometry();g.setAttribute('position',position);g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g}
 const wallPositions:number[]=[],wallIndices:number[]=[]
 for(const w of summitWalls){
  const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],n=Math.ceil(Math.hypot(dx,dz)),cuts=Array.from({length:n+1},(_,i)=>i/n),portal=HORROR_PORTALS.find(p=>w.a[0]===p.x&&w.b[0]===p.x)
  if(portal)for(const z of[portal.z-portal.width/2,portal.z+portal.width/2]){const t=(z-w.a[1])/dz;if(t>0&&t<1)cuts.push(t)}cuts.sort((a,b)=>a-b)
  for(let i=1;i<cuts.length;i++){
   const ta=cuts[i-1]!,tb=cuts[i]!,a=[w.a[0]+dx*ta,w.a[1]+dz*ta],b=[w.a[0]+dx*tb,w.a[1]+dz*tb],bottomA=RETAINING_FOOTING_Y,bottomB=RETAINING_FOOTING_Y
   const face=(loA:number,loB:number,top:number)=>{if(loA>=top&&loB>=top)return;const k=wallPositions.length/3,offset=SUMMIT_WALL_FACE_OFFSET,ax=a[0]!+w.nx*offset,az=a[1]!+w.nz*offset,bx=b[0]!+w.nx*offset,bz=b[1]!+w.nz*offset;wallPositions.push(ax,top,az,ax,Math.min(loA,top),az,bx,top,bz,bx,Math.min(loB,top),bz);if(-dz*w.nx+dx*w.nz>0)wallIndices.push(k,k+1,k+2,k+1,k+3,k+2);else wallIndices.push(k,k+2,k+1,k+1,k+2,k+3)}
   if(portal&&Math.abs((a[1]!+b[1]!)/2-portal.z)<portal.width/2){face(portal.floor+portal.height,portal.floor+portal.height,SUMMIT_HEIGHT+FLOOR_Y_OFFSET);face(bottomA,bottomB,portal.floor)}else face(bottomA,bottomB,SUMMIT_HEIGHT+FLOOR_Y_OFFSET)
  }
 }
 const retaining=new BufferGeometry();retaining.setAttribute('position',new Float32BufferAttribute(wallPositions,3));retaining.setAttribute('color',new Float32BufferAttribute(Array.from({length:wallPositions.length},()=>1),3));retaining.setIndex(wallIndices);retaining.computeVertexNormals();retaining.computeBoundingBox();retaining.computeBoundingSphere()
 return{grass:mesh(grassIndices,grassColors),paving:mesh(pavingIndices,pavingColors),retaining,pavingBoundary:{positions,indices:pavingIndices}}
}
function gradeBakedGround(ground:NonNullable<typeof staticPark>['ground']){
 const updated=new Set<ArrayLike<number>>()
 for(const geometry of [ground.grass,ground.paving]){
  const position=geometry.getAttribute('position')
  if(!updated.has(position.array)){
   for(let i=0;i<position.count;i++){
    const height=position.getY(i)-FLOOR_Y_OFFSET
    const grade=lakeWalkHeight(position.getX(i),position.getZ(i),height)
    if(grade!==height)position.setY(i,grade+FLOOR_Y_OFFSET)
   }
   updated.add(position.array)
  }
  position.needsUpdate=true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
 }
 return ground
}

export const parkGround=staticPark?gradeBakedGround(staticPark.ground):createParkGround()
