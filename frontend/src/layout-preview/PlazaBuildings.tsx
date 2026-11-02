import { PropBuilder,hipRoof } from '../world/art/propGeometry'
import { PropModel } from '../world/art/PropModel'
import { PropSign } from '../world/art/CraftedProp'
import { KIOSKS } from './layout'
import { openConstructionNotice } from '../features/construction/model'
import { LuckyFacility } from '../world/art/LuckyFacilities'
import { luckyRoomArt,lotteryRoomArt } from '../world/art/luckyFacilityGeometry'
import {connectRoof,constructionBoard,constructionBoardPosition} from './plazaBuildingStructure'

type Kind='shop'|'drink'|'photo'
const timber='#a66e35',dark='#694725',trim='#c99858',cream='#f1dfb8'
function base(b:PropBuilder,w:number,d:number){
  b.box('stone','#aaa395',[0,.1,0],[w+.55,.2,d+.55])
  b.box('stone','#d0c6b0',[0,.26,0],[w,.16,d])
  for(let x=-w/2+.5;x<w/2;x+=1)for(let z=-d/2+.5;z<d/2;z+=1)b.box('stone',(Math.round(x+z)%3)?'#d9cfba':'#c4bba8',[x,.35,z],[.97,.025,.97])
  for(const x of [-w/2+.12,w/2-.12])b.box('stone','#999486',[x,.39,0],[.2,.14,d])
  // One broad low step faces the plaza, with individual masonry joints.
  b.box('stone','#b2ab9a',[0,.12,d/2+.48],[w-.65,.24,.95])
  for(let x=-w/2+.5;x<w/2-.3;x+=.8)b.box('stone','#dad1be',[x,.245,d/2+.49],[.77,.025,.91])
}
function lantern(b:PropBuilder,x:number,y:number,z:number,scale=1){
  b.box('metal','#483b2a',[x,y+.48*scale,z],[.04,.28*scale,.04])
  b.box('glow','#ffe1a1',[x,y,z],[.34*scale,.6*scale,.34*scale])
  for(const dy of [-.34,.34])b.box('metal','#4a3b29',[x,y+dy*scale,z],[.47*scale,.09*scale,.47*scale])
  for(const sx of [-1,1])for(const sz of [-1,1])b.box('wood',dark,[x+sx*.18*scale,y,z+sz*.18*scale],[.04*scale,.65*scale,.04*scale])
}
function hungLantern(b:PropBuilder,x:number,y:number,z:number,scale=1){
  lantern(b,x,y,z,scale)
  const start=y+.55*scale,end=4.25
  b.box('metal','#483b2a',[x,(start+end)/2,z],[.12,end-start+.12,.12])
  b.box('wood',dark,[x,4.2,z],[.35,.2,1.1])
}
function floorLantern(b:PropBuilder,x:number,y:number,z:number,scale:number){
  lantern(b,x,y,z,scale)
  const top=y-.30*scale
  b.box('stone','#aaa395',[x,(.28+top)/2,z],[.52*scale,top-.28+.04,.52*scale])
}
function frame(b:PropBuilder,w:number,d:number){
  for(const x of [-w/2+.2,w/2-.2])for(const z of [-d/2+.25,d/2-.25]){
    b.box('stone','#aea99a',[x,.61,z],[.65,.5,.65])
    b.cylinder('wood',timber,[x,2.5,z],.17,.23,3.6,[0,0,0],14)
    for(const h of [3.75,4.02])b.box('wood',trim,[x,h,z],[.72,.18,.7])
    for(const sign of [-1,1])b.box('wood',dark,[x+sign*.32,3.76,z],[.65,.16,.22],[0,0,sign*.35])
  }
  for(const z of [-d/2+.25,d/2-.25])for(const h of [3.9,4.2])b.box('wood',h<4?'#b77c39':dark,[0,h,z],[w+.4,.23,.32])
  for(const x of [-w/2+.2,w/2-.2])b.box('wood',timber,[x,4.1,0],[.32,.32,d])
  for(let x=-w/2+.45;x<w/2;x+=.55){b.box('wood',trim,[x,4.32,d/2],[.18,.18,.65]);b.box('wood',dark,[x,4.49,d/2-.1],[.26,.14,.85])}
}
function lattice(b:PropBuilder,x:number,z:number,w:number,h:number){
  b.box('paint','#e4ca99',[x,2.05,z],[w,h,.1])
  for(const side of [-1,1]){b.box('wood',dark,[x+side*w/2,2.05,z+.09],[.1,h+.12,.14]);b.box('wood',dark,[x,2.05+side*h/2,z+.09],[w+.1,.1,.14])}
  for(let i=1;i<7;i++)b.box('wood',trim,[x-w/2+w*i/7,2.05,z+.1],[.045,h,.05])
  for(let i=-2;i<=2;i++)b.box('wood',trim,[x,2.05+i*h/6,z+.12],[w,.045,.04])
}
function board(b:PropBuilder,w:number,y:number,z:number){
  b.box('wood',dark,[0,y,z],[w+.3,.92,.25])
  b.box('paint',cream,[0,y,z+.14],[w,.69,.04])
  for(const x of [-w/2,w/2])for(const dy of [-.4,.4])b.box('wood',trim,[x,y+dy,z+.18],[.24,.19,.08])
}
const photo=new PropBuilder([14,10]);base(photo,9.2,7);frame(photo,8.8,6.6)
photo.box('wood',dark,[0,2.22,-2.8],[8.4,3.7,.2]);photo.box('paint','#727f93',[0,2.38,-2.64],[5.7,3.4,.04])
for(const x of [-3.65,3.65])lattice(photo,x,1,1.15,2.9)
for(const x of [-4.1,4.1])for(const y of [.6,3.5])photo.box('wood',timber,[x,y,0],[.25,.18,6.2])
hipRoof(photo,10.5,8.7,4.65,1.55);board(photo,4.3,4.23,3.9)
connectRoof(photo,8.8,6.6)
for(const x of [-1.7,1.7])photo.box('wood',dark,[x,4.23,3.5],[.18,.25,1])
for(const x of [-3.8,3.8])hungLantern(photo,x,3.05,3.55)
for(const x of [-2.35,2.35])hungLantern(photo,x,3.58,2.6,.55)
// An open photo backdrop, short timber posing seat and separate camera terminal.
photo.box('wood',trim,[0,.97,-1.35],[4.45,.16,.7]);photo.box('wood',timber,[0,1.6,-1.65],[4.45,.58,.15])
for(const x of [-1.7,1.7])photo.box('metal','#4d4b3b',[x,.64,-1.35],[.13,.6,.5])
for(const x of [-1.7,1.7])photo.box('wood',timber,[x,1.32,-1.65],[.16,.9,.18])
photo.box('paint','#dedbc9',[3.0,1.8,1.7],[1.05,2.9,.75]);photo.box('metal','#39494d',[3,2.55,2.1],[.85,.8,.025]);photo.cylinder('metal','#222f35',[3,2.67,2.19],.24,.29,.16,[Math.PI/2,0,0],32);photo.cylinder('paint','#6c9eab',[3,2.67,2.3],.17,.17,.04,[Math.PI/2,0,0],32)
photo.box('metal','#354c55',[3,1.67,2.1],[.7,.65,.03]);photo.box('metal','#363b34',[3,.9,2.1],[.58,.12,.04])
photo.box('wood',dark,[-3.5,1.4,3.45],[1,1.8,.14],[.12,0,0]);photo.box('paint',cream,[-3.5,1.4,3.55],[.85,1.6,.03])
for(const x of [-3.85,-3.15])photo.box('wood',timber,[x,1,3.45],[.14,1.35,.23])
for(const x of [-4,4])floorLantern(photo,x,.8,3.55,.7)

constructionBoard(photo,KIOSKS.find(k=>k.kind==='photo')!.depth)

export const plazaBuildingArt={shop:luckyRoomArt,drink:lotteryRoomArt,photo:photo.finish()}
const titles={shop:'상점',drink:'응모부스',photo:'포토부스'}
function title(kind:Kind){return(c:CanvasRenderingContext2D,w:number,h:number)=>{
 c.fillStyle=cream;c.fillRect(0,0,w,h);c.strokeStyle='#bd975d';c.lineWidth=9;c.strokeRect(7,7,w-14,h-14)
 c.fillStyle='#382b20';c.strokeStyle='#382b20';c.lineWidth=h*.045;c.lineJoin='round'
 const x=w*.12,y=h*.5,r=h*.23
 if(kind==='photo'){c.strokeRect(x-r,y-r*.7,r*2,r*1.4);c.beginPath();c.arc(x,y,r*.43,0,Math.PI*2);c.stroke();c.fillRect(x-r*.6,y-r,r*.6,r*.25)}
 else if(kind==='shop'){c.strokeRect(x-r*.75,y-r*.45,r*1.5,r*1.3);c.beginPath();c.arc(x,y-r*.45,r*.4,Math.PI,0);c.stroke()}
 else{c.strokeRect(x-r,y-r*.5,r*2,r);for(const sign of [-1,1]){c.beginPath();c.arc(x+sign*r,y,r*.22,-Math.PI/2,Math.PI/2,sign<0);c.stroke()}}
 c.font='700 '+h*.55+'px "Malgun Gothic",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(titles[kind],w*.59,h*.52,w*.72)
}}
function backdrop(c:CanvasRenderingContext2D,w:number,h:number){
 const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#62789e');sky.addColorStop(.65,'#ddb6ac');sky.addColorStop(1,'#f0cc9d');c.fillStyle=sky;c.fillRect(0,0,w,h)
 c.fillStyle='#f9e8b2';c.beginPath();c.arc(w*.78,h*.2,h*.085,0,Math.PI*2);c.fill()
 for(let layer=0;layer<3;layer++){c.fillStyle=['#9b9dac','#737f8d','#536677'][layer]!;c.beginPath();c.moveTo(0,h);for(let n=0;n<=20;n++)c.lineTo(n*w/20,h*(.6+layer*.1)-Math.sin(n*.6+layer)*h*.09);c.lineTo(w,h);c.fill()}
 c.fillStyle='#334e62';c.fillRect(w*.48,h*.31,w*.023,h*.48);c.fillRect(w*.455,h*.39,w*.075,h*.035);c.fillRect(w*.47,h*.32,w*.045,h*.12);c.fillRect(w*.49,h*.21,w*.006,h*.13)
 c.fillStyle='#f9db99';for(let n=0;n<27;n++){c.beginPath();c.arc((n*.319%1)*w,h*(.7+n%4*.04),h*.006,0,Math.PI*2);c.fill()}
 c.font='500 '+h*.045+'px "Malgun Gothic",sans-serif';c.textAlign='center';c.fillText('온탑에서 남기는 오늘의 한 장',w/2,h*.94)
}
const signs={shop:title('shop'),drink:title('drink'),photo:title('photo')}
const constructionSign=(c:CanvasRenderingContext2D,w:number,h:number)=>{
 c.fillStyle='#e7c878';c.fillRect(0,0,w,h);c.strokeStyle='#655537';c.lineWidth=12;c.strokeRect(6,6,w-12,h-12)
 c.fillStyle='#423d2c';c.font=`700 ${h*.55}px "Malgun Gothic",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('공사 중',w/2,h/2,w*.85)
}
export function PlazaBuilding({kind,live=false}:{kind:Kind;live?:boolean}){
 if(kind!=='photo')return <LuckyFacility kind={kind} live={live}/>
 const k=KIOSKS.find(k=>k.kind===kind)!
 const id='layout-'+kind
 return <group name={id} position={[k.x,0,k.z]} rotation={[0,k.yaw,0]} userData={{assetId:'procedural/plaza-'+kind,previewRole:kind,construction:true}} onClick={event=>{
  event.stopPropagation()
  if(!live)openConstructionNotice(id)
  else void import('../features/interactions/parkInteraction').then(({getParkInteraction,interactWithPark})=>{
   if(getParkInteraction()?.id===id)interactWithPark()
  })
 }}>
  <PropModel art={plazaBuildingArt[kind]} name={kind+'-draft-building'}/>
  <PropSign position={constructionBoardPosition(k.depth)} width={2.7} height={.8} draw={constructionSign}/>
  <PropSign position={[0,4.23,4.06]} width={4.3} height={.69} draw={signs.photo}/>
  {kind==='photo'&&<PropSign position={[0,2.38,-2.59]} width={5.7} height={3.4} draw={backdrop}/>}
 </group>
}
