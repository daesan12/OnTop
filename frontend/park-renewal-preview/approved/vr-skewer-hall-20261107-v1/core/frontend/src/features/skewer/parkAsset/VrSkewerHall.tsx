import {PropModel} from '../../../../../../../../../src/world/art/PropModel.tsx'
import {PropSign} from '../../../../../../../../../src/world/art/CraftedProp.tsx'
import {buildVrSkewerHall,VR_SKEWER_HALL} from './vrSkewerHallGeometry'
import {FirepitEffects} from './FirepitEffects'

const showOriginal=new URLSearchParams(window.location.search).get('skewer-profile')==='before'
const art=buildVrSkewerHall(!showOriginal)
function skewerIcon(c:CanvasRenderingContext2D,x:number,y:number,size:number){
 c.save();c.translate(x,y);c.rotate(.3);c.fillStyle='#ffedbe';c.fillRect(-size*.035,-size*.48,size*.07,size)
 for(let i=0;i<3;i++){c.beginPath();c.roundRect(-size*.18,-size*.32+i*size*.24,size*.36,size*.17,size*.04);c.fill()};c.restore()
}
function flag(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#bb5453';c.fillRect(0,0,w,h);skewerIcon(c,w*.5,h*.49,h*.79)
}
function title(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#6f4933';c.fillRect(0,0,w,h);c.fillStyle='#ffe5b7';c.font=`800 ${h*.64}px "Malgun Gothic",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('VR 꼬치왕',w/2,h/2,w*.92)
}
function windowArt(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#332447';c.fillRect(0,0,w,h);c.strokeStyle='#bba1ff';c.lineWidth=h*.035;c.shadowColor='#b088ff';c.shadowBlur=h*.07
 c.beginPath();c.roundRect(w*.13,h*.28,w*.4,h*.3,h*.09);c.stroke();c.beginPath();c.moveTo(w*.26,h*.58);c.lineTo(w*.33,h*.51);c.lineTo(w*.4,h*.58);c.stroke()
 skewerIcon(c,w*.73,h*.45,h*.65);c.shadowBlur=0;c.fillStyle='#debcff';c.textAlign='center';c.font=`800 ${h*.15}px sans-serif`;c.fillText('VR  ×  SKEWER',w*.5,h*.89)
}
function inside(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#3b2854';c.fillRect(0,0,w,h);c.strokeStyle='#bb91ff';c.lineWidth=5;c.strokeRect(4,4,w-8,h-8)
 skewerIcon(c,w*.13,h*.5,h*.72);skewerIcon(c,w*.87,h*.5,h*.72)
 c.fillStyle='#f3daff';c.textAlign='center';c.textBaseline='middle';c.font=`800 ${h*.34}px "Malgun Gothic",sans-serif`;c.fillText('VR 꼬치왕',w/2,h*.35,w*.6)
 c.fillStyle='#b6baff';c.font=`700 ${h*.13}px sans-serif`;c.fillText('READY TO COOK',w/2,h*.76,w*.6)
}
function station(c:CanvasRenderingContext2D,w:number,h:number){c.fillStyle='#33334d';c.fillRect(0,0,w,h);c.fillStyle='#d8d5ff';c.font=`800 ${h*.65}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('VR STATION',w/2,h*.5,w*.92)}

/** Local park asset preview only. Existing VR entry/game behavior stays separate. */
export function VrSkewerHall({cutaway=false,onInspect}:{cutaway?:boolean;onInspect?:()=>void}){
 return <group name="vr-skewer-hall" userData={{assetId:'procedural/vr-skewer-hall',previewOnly:true,stations:3}} onClick={e=>{if(onInspect){e.stopPropagation();onInspect()}}}>
  <PropModel art={art.body} name="vr-skewer-body"/>
  <FirepitEffects/>
  <PropModel art={cutaway?art.cutWalls:art.walls} name="vr-skewer-walls"/>
  {!cutaway&&<PropModel art={art.roof} name="vr-skewer-roof-and-food"/>}
  {Object.entries(art.neon).map(([key,geometry])=><mesh key={key} name="vr-skewer-interior-neon" geometry={geometry} dispose={null}><meshBasicMaterial vertexColors toneMapped={false}/></mesh>)}
  {!cutaway&&<>
   {Object.entries(art.roofNeon).map(([key,geometry])=><mesh key={key} name="vr-skewer-sign-neon" geometry={geometry} dispose={null}><meshBasicMaterial vertexColors toneMapped={false}/></mesh>)}
   <PropSign width={3.8} height={.43} position={[0,4.41,5.35]} draw={title} font='800 48px "Malgun Gothic"'/>
   {[-1,1].map(side=><PropSign key={side} width={.82} height={1.92} position={[side*3.02,2.78,4.653]} draw={flag}/>)}
   <PropSign width={1.95} height={1.73} position={[-4.65,2.25,4.455]} draw={windowArt} font="800 48px sans-serif"/>
  </>}
  <PropSign width={7.3} height={1.8} position={[0,3.08,-4.13]} draw={inside} font='800 48px "Malgun Gothic"'/>
  {VR_SKEWER_HALL.stations.map(x=><PropSign key={x} width={1.65} height={.2} position={[x,1.08,-1.939]} draw={station} font="800 48px sans-serif"/>)}
 </group>
}
