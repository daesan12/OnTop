import {BoxGeometry,Matrix4,Quaternion,Vector3} from 'three'
import {useMemo} from 'react'
import {ParkFountain} from '../world/art/ParkFountain'
import {ReferenceBench} from '../world/art/ReferenceBenchFrames'
import {StonePagoda} from '../world/art/StonePagoda'
import {PropModel} from '../world/art/PropModel'
import {PropBuilder} from '../world/art/propGeometry'
import {GARDEN_PAGODA} from '../config/pagoda'
import {FOUNTAIN} from '../config/parkPlan'
import {PARK_DATA} from '../map/park'
import {SITES as ORIGINAL,DRAFT_FOUNTAIN,SETTINGS} from '../layout-preview/layout'
import {pagodaBalustradeArt} from '../layout-preview/pagodaBalustrade'
import {createStairFlight} from '../layout-preview/stairFlightGeometry'
import {WalkwayMaterial} from '../world/art/WalkwayMaterial'
import {site,heightAt,MONUMENT_STAIRS} from './plan'
import {fitnessFenceSegments} from './motionPlan'
import {stairCheeks,stairRailAnchors} from './stairFinishGeometry'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {renewalFountainTerrain} from './fountainAccessGeometry'

function beam(b:InstanceType<typeof PropBuilder>,kind:'stone'|'wood',color:string,a:number[],z:number[],width:number){const av=new Vector3(...a),bv=new Vector3(...z),d=bv.clone().sub(av),g=new BoxGeometry(width,d.length(),width),matrix=new Matrix4().compose(av.add(bv).multiplyScalar(.5),new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()),new Vector3(1,1,1));g.applyMatrix4(matrix);b.add(kind,g,color)}
export const preservedFountainBenches=PARK_DATA.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-'))
export function PreservedFountain(){const s=site('fountain');return <group name="preserved-fountain-complete-district" position={[s.x-ORIGINAL.fountain.x,heightAt(s.x,s.z),s.z-ORIGINAL.fountain.z]}>
  <mesh geometry={renewalFountainTerrain} dispose={null}><WalkwayMaterial color="#c4bfb1"/></mesh>
 <group position={[ORIGINAL.fountain.x,0,ORIGINAL.fountain.z]} scale={[DRAFT_FOUNTAIN.scale,1,DRAFT_FOUNTAIN.scale]}><group position={[-FOUNTAIN.x,0,-FOUNTAIN.z]}><ParkFountain quality="low" jetHeightScale={DRAFT_FOUNTAIN.jetHeightScale}/></group></group>
 {preservedFountainBenches.map(b=><ReferenceBench key={b.siteId} name={b.siteId} position={[...b.position]} yaw={b.yaw} horizontalScale={DRAFT_FOUNTAIN.scale} seatHeight={.56}/>)}
 </group>}
const garden=(()=>{const b=new PropBuilder([8,6]),p=SETTINGS.pagoda,top=ORIGINAL.pagoda.floor;b.box('stone','#b9b6a6',[0,top/2,0],[p.terraceHalf*2,top,p.terraceHalf*2]);for(let side=0;side<4;side++)b.add('stone',createStairFlight(p.stairHalfWidth*2,p.terraceHalf,Array.from({length:p.steps},(_,i)=>({edge:p.terraceHalf+(i+1)*p.tread+.01,height:(p.steps-i)*p.riser}))),'#d4cebc',[0,0,0],[1,1,1],[0,side*Math.PI/2,0]);return b.finish()})()
export const longStairs=(()=>{
 const p=MONUMENT_STAIRS,b=new PropBuilder(),length=p.zBottom-p.zTop,rise=p.top-p.bottom
 // The terrain supplies the upper landing: no coplanar slab over it.
 b.add('stone',createStairFlight(p.width,0,Array.from({length:p.steps},(_,i)=>({edge:(i+1)*length/p.steps,height:rise*(p.steps-i)/p.steps+.085}))),'#c8c0ae')
 for(const side of[-1,1]){const x=side*(p.width/2+.2),points=[{z:-.65,y:rise+.085},...stairRailAnchors,{z:length+.35,y:.085}];for(let i=0;i<points.length;i++){const {z,y}=points[i]!,rail=rise*(1-Math.max(0,Math.min(1,z/length)))+1.23;b.box('stone','#aba892',[x,(y+rail)/2,z],[.18,rail-y,.18]);if(i){const prev=points[i-1]!,yp=rise*(1-Math.max(0,Math.min(1,prev.z/length)))+1.23;beam(b,'stone','#bcb6a5',[x,yp,prev.z],[x,rail,z],.12)}}}
 return b.finish()
})()
export function PreservedPagodaGarden(){const s=site('pagoda'),y=heightAt(s.x,s.z);return <>
 <group name="preserved-pagoda-garden" position={[s.x,y,s.z]}>
  <PropModel art={garden} name="preserved-pagoda-terrace-and-four-stairs"/>
  <group position={[-ORIGINAL.pagoda.x,0,-ORIGINAL.pagoda.z]}><PropModel art={pagodaBalustradeArt} name="preserved-pagoda-stone-rails"/></group>
  <group position={[0,ORIGINAL.pagoda.floor,0]}><StonePagoda anchor={{...GARDEN_PAGODA,x:0,z:0}} decorations={false}/></group>
 </group>
 <group name="monument-direct-ascent" position={[MONUMENT_STAIRS.x,MONUMENT_STAIRS.bottom,MONUMENT_STAIRS.zTop]}><PropModel art={longStairs} name="ninety-five-stair-direct-ascent"/><mesh name="terrain-supported-masonry-stair-cheeks" geometry={stairCheeks}><ParkStoneMaterial large/></mesh></group>
 </>}
export function FitnessFence(){const art=useMemo(()=>{const b=new PropBuilder();for(const{a,z}of fitnessFenceSegments()){const y=heightAt(...a);for(const p of[a,z]){b.box('wood','#785f3e',[p[0],y+.65,p[1]],[.16,1.3,.16]);b.box('tile','#46584b',[p[0],y+1.34,p[1]],[.25,.12,.25])}for(const h of[.4,1.05])beam(b,'wood','#a18862',[a[0],y+h,a[1]],[z[0],y+h,z[1]],.09)}return b.finish()},[]);return <PropModel art={art} name="fitness-boundary-with-north-and-south-openings"/>}
