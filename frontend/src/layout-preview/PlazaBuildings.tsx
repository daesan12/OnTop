import { DoubleSide } from 'three'
import { PropBuilder,hipRoof,type XYZ } from '../world/art/propGeometry'
import { PropModel } from '../world/art/PropModel'
import { PropSign } from '../world/art/CraftedProp'
import { KIOSKS } from './layout'
import { openConstructionNotice } from '../features/construction/model'
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
function gift(b:PropBuilder,p:XYZ,color:string,s=.32){
  b.box('paint',color,p,[s,s*.85,s]);b.box('paint','#edcf8b',p,[s*.16,s*.9,s+.02]);b.box('paint','#edcf8b',[p[0],p[1]+s*.44,p[2]],[s+.03,.035,s*.18])
}
function bear(b:PropBuilder,x:number,y:number,z:number){
  b.ball('paint','#be9765',[x,y,z],[.22,.3,.19]);b.ball('paint','#e0c28c',[x,y+.36,z],[.25,.23,.21])
  for(const side of [-1,1]){b.ball('paint','#bc8d59',[x+side*.19,y+.54,z],[.095,.1,.07]);b.ball('paint','#cb9e69',[x+side*.27,y+.05,z],[.12,.19,.12])}
  b.ball('paint','#efe0b6',[x,y+.3,z+.18],[.13,.1,.06]);for(const side of [-1,1])b.ball('paint','#29271f',[x+side*.08,y+.4,z+.19],[.025,.03,.02])
}
const shop=new PropBuilder([12,8]);base(shop,10.2,7.6);frame(shop,9.6,7.2)
shop.box('paint','#dfcba3',[0,2.1,-3.25],[9.2,3.45,.2])
for(const x of [-4.65,4.65])shop.box('wood',timber,[x,1.95,0],[.16,3.2,6.5])
for(const x of [-3.45,3.45])lattice(shop,x,2.9,1.65,2.9)
for(const x of [-3.15,3.15])shop.box('wood',timber,[x,1.8,-2.4],[.18,2.95,1])
// Deep open merchandise shelves, a continuous front counter, bags and little gifts.
for(const y of [1.15,2,2.85]){
  shop.box('wood',dark,[0,y,-2.4],[6.5,.12,1]);
  for(let n=0;n<10;n++){const x=-2.9+n*.63;gift(shop,[x,y+.27,-2.2],['#d19665','#688e91','#c6a450','#87936b'][n%4]!, .35);if(y>2)shop.box('paint','#e1d0aa',[x,y+.37,-2.7],[.3,.62,.12])}
}
shop.box('wood',timber,[0,1.08,2.9],[6.2,1.45,1.1]);shop.box('wood',trim,[0,1.85,2.9],[6.6,.18,1.45])
for(let x=-2.9;x<3;x+=.25)shop.box('wood','#895a31',[x,1.1,3.47],[.025,1.35,.025])
for(let i=0;i<7;i++)gift(shop,[-1.1+i*.48,2.08,2.95],['#e0c174','#8fa3a1','#b88471'][i%3]!,.34)
for(const x of [-2.4,-1.8])bear(shop,x,2.18,2.8)
shop.box('metal','#3b4440',[2.55,2.13,2.82],[.65,.55,.48]);shop.box('paint','#a9c1bb',[2.55,2.23,3.08],[.51,.25,.025])
for(let i=0;i<7;i++){shop.box('paint',i%2?'#e9d9ba':'#f2e6cd',[-2.9+i*.96,3.47,3.55],[.93,.72,.06]);shop.cylinder('wood',trim,[-2.9+i*.96,3.89,3.55],.035,.035,.98,[0,0,Math.PI/2])}
shop.box('wood',dark,[0,3.94,3.55],[6.9,.18,.16])
for(const x of [-3.2,3.2])shop.box('wood',timber,[x,4.05,3.5],[.14,.5,.24])
hipRoof(shop,11.4,9.2,4.65,1.75)
connectRoof(shop,9.6,7.2)
board(shop,3.7,4.27,4.14)
for(const x of [-1.4,1.4])shop.box('wood',dark,[x,4.27,3.76],[.18,.25,1.05])
for(const x of [-4,4])hungLantern(shop,x,3.2,3.95)
for(const x of [-4.4,4.4])floorLantern(shop,x,.83,3.85,.75)
// Freestanding gift board and a photo-card rack stay on the building apron.
shop.box('wood',dark,[-3.9,1.37,4.0],[1.05,1.65,.12],[.1,0,0]);shop.box('paint','#344a40',[-3.9,1.38,4.09],[.89,1.43,.025])
for(const x of [-4.25,-3.55])shop.box('wood',timber,[x,1,3.98],[.14,1.35,.23])
for(const x of [3.6,4.35])shop.box('metal','#3a3931',[x,1.65,3.75],[.055,2.5,.055])
for(const y of [.57,1.45,2.35])shop.box('metal','#3a3931',[3.98,y,3.78],[.85,.13,.18])
for(let row=0;row<5;row++)for(let col=0;col<3;col++)shop.box('paint',row%2?'#879b99':'#d1bba0',[3.6+col*.25,.75+row*.43,3.83],[.21,.32,.05])

const booth=new PropBuilder([14,10]);base(booth,8.2,5.4)
for(const x of [-3.65,3.65])for(const z of [-2.1,2.1])booth.box('wood',timber,[x,2.47,z],[.22,4.2,.22])
for(const x of [-3.75,3.75])booth.box('wood',dark,[x,4.55,-.2],[.22,.25,5])
for(const z of [-2.4,0])booth.box('wood',trim,[0,4.55,z],[8,.22,.22])
booth.box('wood',timber,[0,1.1,1.5],[7.25,1.45,1.05]);booth.box('wood',trim,[0,1.88,1.55],[7.65,.17,1.4])
for(let x=-3.4;x<=3.4;x+=.28)booth.box('wood','#87552b',[x,1.08,2.04],[.025,1.32,.025])
booth.box('paint','#efe0ba',[0,1.08,2.08],[2.2,1.25,.035]);booth.box('wood',dark,[0,1.08,2.1],[.06,1.2,.02])
// Sloped striped fabric canopy with rounded scalloped valances.
for(let i=0;i<14;i++){
 const x=-3.9+(i+.5)*7.8/14,c=i%2?'#f5e8cf':'#d76b42'
 booth.box('paint',c,[x,4.12,1.22],[.557,.055,3.2],[.23,0,0])
 booth.box('paint',c,[x,3.58,2.8],[.55,.47,.06]);booth.cylinder('paint',c,[x,3.35,2.8],.275,.275,.06,[Math.PI/2,0,0],18)
}
board(booth,4.8,5.06,1.3)
for(const x of [-1.9,1.9]){
 booth.box('wood',dark,[x,4.55,.65],[.18,.2,1.55])
 booth.box('wood',timber,[x,4.77,1.3],[.18,.6,.18])
}
for(let n=0;n<5;n++){const x=-3.15+n*1.55;booth.curve('metal','#454034',[[x,3.8,2.6],[x,3.65,2.65],[x,3.4,2.65]],.075,8);booth.ball('glow','#ffe1a1',[x,3.27,2.65],[.1,.16,.1])}
// Raffle drum, brass hoops, axle, feet and individual folded ticket slips.
for(const x of [-.05,1.65]){booth.box('wood',dark,[x,2.13,1.35],[.1,.5,.55]);booth.ring('gold','#c2964a',[x,2.65,1.35],.62,.035,[0,Math.PI/2,0])}
booth.cylinder('metal','#8b7652',[.8,2.65,1.35],.035,.035,2.3,[0,0,Math.PI/2],12)
for(let n=0;n<36;n++){const a=n*2.4,r=.15+(n%4)*.09;booth.box('paint',n%3?'#ebd7a5':'#bb9277',[.13+(n%6)*.26,2.35+Math.abs(Math.sin(a))*r,1.35+Math.cos(a)*r],[.19,.04,.15],[a,.4,a/2])}
booth.box('wood',trim,[-2.2,2.3,1.4],[1.25,.8,.95]);booth.box('metal','#3e3b2d',[-2.2,2.63,1.9],[.7,.07,.02]);booth.box('metal','#3d4240',[2.6,2.43,1.5],[.91,1.1,.13],[.12,0,0])
for(const x of [-3.45,3.45])floorLantern(booth,x,.83,2.65,.75)
for(let n=0;n<3;n++){
 const x=-4.0+n*.5,y=5.8+n*.65,z=-.8+n*.32
 booth.ball('paint',['#597b9c','#eee0bd','#f6e6c3'][n]!,[x,y,z],[.45,.6,.45]);booth.curve('wood',dark,[[x,.32,z],[x-.15,3,z],[x,y-.58,z]],.075,16)
}
booth.box('wood',dark,[4.1,2.4,.4],[.08,4.3,.08]);booth.box('wood',trim,[4.65,4.1,.4],[1.3,.08,.08]);booth.box('paint','#eee0be',[4.65,2.85,.4],[1.05,2.4,.035])

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

constructionBoard(shop,KIOSKS.find(k=>k.kind==='shop')!.depth)
constructionBoard(booth,KIOSKS.find(k=>k.kind==='drink')!.depth)
constructionBoard(photo,KIOSKS.find(k=>k.kind==='photo')!.depth)

export const plazaBuildingArt={shop:shop.finish(),drink:booth.finish(),photo:photo.finish()}
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
function tickets(c:CanvasRenderingContext2D,w:number,h:number){c.fillStyle='#f5ead2';c.fillRect(0,0,w,h);c.fillStyle='#ac623f';c.textAlign='center';c.font='700 '+w*.16+'px "Malgun Gothic",sans-serif';c.fillText('응모하기',w/2,h*.3);c.font=w*.11+'px "Malgun Gothic",sans-serif';c.fillText('오늘의 행운',w/2,h*.55);c.fillText('참여 안내',w/2,h*.75)}
const signs={shop:title('shop'),drink:title('drink'),photo:title('photo')}
const constructionSign=(c:CanvasRenderingContext2D,w:number,h:number)=>{
 c.fillStyle='#e7c878';c.fillRect(0,0,w,h);c.strokeStyle='#655537';c.lineWidth=12;c.strokeRect(6,6,w-12,h-12)
 c.fillStyle='#423d2c';c.font=`700 ${h*.55}px "Malgun Gothic",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('공사 중',w/2,h/2,w*.85)
}
export function PlazaBuilding({kind,live=false}:{kind:Kind;live?:boolean}){
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
  <PropSign position={kind==='shop'?[0,4.27,4.3]:kind==='drink'?[0,5.06,1.47]:[0,4.23,4.06]} width={kind==='shop'?3.7:kind==='drink'?4.8:4.3} height={.69} draw={signs[kind]}/>
  {kind==='drink'&&<><mesh position={[.8,2.65,1.35]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.62,.62,1.7,32,1,true]}/><meshPhysicalMaterial color="#d7e5df" transparent opacity={.24} roughness={.12} metalness={.05} depthWrite={false} side={DoubleSide}/></mesh><PropSign position={[2.6,2.43,1.59]} width={.72} height={.85} draw={tickets}/><PropSign position={[4.65,2.85,.43]} width={1} height={2.3} draw={tickets}/></>}
  {kind==='photo'&&<PropSign position={[0,2.38,-2.59]} width={5.7} height={3.4} draw={backdrop}/>}
 </group>
}
