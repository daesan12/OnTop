import {BoxGeometry,Matrix4,Quaternion,Vector3} from 'three'
import {useMemo} from 'react'
import {StonePagoda} from '../src/world/art/StonePagoda'
import {PropModel} from '../src/world/art/PropModel'
import {PropBuilder} from '../src/world/art/propGeometry'
import {GARDEN_PAGODA} from '../src/config/pagoda'
import {SITES as ORIGINAL,SETTINGS} from '../src/layout-preview/layout'
import {pagodaBalustradeArt} from '../src/layout-preview/pagodaBalustrade'
import {createStairFlight} from '../src/layout-preview/stairFlightGeometry'
import {site,heightAt,MONUMENT_STAIRS} from './plan'
import { MONUMENT_TREAD_OFFSET } from './monumentStairPlan'
import {buildFitnessFence} from './fitnessFenceGeometry'
import {stairCheeks,stairRailAnchors} from './stairFinishGeometry'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {HILL_VERGE_INSET,HILLSIDE_RAIL_HEIGHTS,MONUMENT_STAIR_RAIL} from './guardDimensions'
import {guardFloorY} from './groundSurface'

function beam(b:InstanceType<typeof PropBuilder>,kind:'stone'|'wood',color:string,a:number[],z:number[],width:number){const av=new Vector3(...a),bv=new Vector3(...z),d=bv.clone().sub(av),g=new BoxGeometry(width,d.length(),width),matrix=new Matrix4().compose(av.add(bv).multiplyScalar(.5),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1));g.applyMatrix4(matrix);b.add(kind,g,color)}
const garden=(()=>{const b=new PropBuilder([8,6]),p=SETTINGS.pagoda,top=ORIGINAL.pagoda.floor;b.box('stone','#b9b6a6',[0,top/2,0],[p.terraceHalf*2,top,p.terraceHalf*2]);for(let side=0;side<4;side++)b.add('stone',createStairFlight(p.stairHalfWidth*2,p.terraceHalf,Array.from({length:p.steps},(_,i)=>({edge:p.terraceHalf+(i+1)*p.tread+.01,height:(p.steps-i)*p.riser}))),'#d4cebc',[0,0,0],[1,1,1],[0,side*Math.PI/2,0]);return b.finish()})()
export const longStairs=(()=>{
 const p=MONUMENT_STAIRS,b=new PropBuilder(),length=p.zBottom-p.zTop,rise=p.top-p.bottom
 // The terrain supplies the upper landing: no coplanar slab over it.
 b.add('stone',createStairFlight(p.width,0,Array.from({length:p.steps},(_,i)=>({edge:(i+1)*length/p.steps,height:rise*(p.steps-i)/p.steps+MONUMENT_TREAD_OFFSET}))),'#c8c0ae')
 const {sideOffset,postWidth,handrailWidth,bottomOverhang,height}=MONUMENT_STAIR_RAIL
 for(const side of[-1,1]){
  const x=side*(p.width/2+sideOffset),jointZ=-HILL_VERGE_INSET
  const jointRail=guardFloorY(p.x+x,p.zTop+jointZ)-p.bottom+HILLSIDE_RAIL_HEIGHTS[1]
  const points=[
   {z:jointZ,y:rise+.085,rail:jointRail},
   ...[...stairRailAnchors,{z:length+bottomOverhang,y:.085}].map(({z,y})=>({z,y,rail:rise*(1-Math.min(1,z/length))+height})),
  ]
  for(const [index,{z,y,rail}] of points.entries()){
   const postTop=index===0?rail+handrailWidth/2:rail
   b.box('stone','#aba892',[x,(y+postTop)/2,z],[postWidth,postTop-y,postWidth])
   const previous=points[index-1]
   if(previous)beam(b,'stone','#bcb6a5',[x,previous.rail,previous.z],[x,rail,z],handrailWidth)
  }
 }
 return b.finish()
})()
export function PreservedPagodaGarden(){const s=site('pagoda'),y=heightAt(s.x,s.z);return <>
 <group name="preserved-pagoda-garden" position={[s.x,y,s.z]}>
  <PropModel art={garden} name="preserved-pagoda-terrace-and-four-stairs"/>
  <group position={[-ORIGINAL.pagoda.x,0,-ORIGINAL.pagoda.z]}><PropModel art={pagodaBalustradeArt} name="preserved-pagoda-stone-rails"/></group>
  <group position={[0,ORIGINAL.pagoda.floor,0]} userData={{keepOpaque:true}}><StonePagoda anchor={{...GARDEN_PAGODA,x:0,z:0}} decorations={false}/></group>
 </group>
 <group name="monument-direct-ascent" position={[MONUMENT_STAIRS.x,MONUMENT_STAIRS.bottom,MONUMENT_STAIRS.zTop]}><PropModel art={longStairs} name="ninety-five-stair-direct-ascent"/><mesh name="terrain-supported-masonry-stair-cheeks" geometry={stairCheeks} userData={{keepOpaque:true}}><ParkStoneMaterial large/></mesh></group>
 </>}
export function FitnessFence(){
 const art=useMemo(buildFitnessFence,[])
 return <PropModel art={art} name="fitness-boundary-with-north-and-south-openings"/>
}
