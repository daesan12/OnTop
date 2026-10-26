
import { PropBuilder,hipRoof } from '../world/art/propGeometry'
import { PropModel } from '../world/art/PropModel'
import { PropSign } from '../world/art/CraftedProp'
import { KIOSKS } from './layout'

type Kind='shop'|'drink'|'photo'
function glazedWindow(b:PropBuilder,x:number,y:number,z:number,w:number,h:number){
  b.box('paint','#5a8180',[x,y,z],[w,h,.09])
  for(const side of [-1,1]){
    b.box('wood','#70553c',[x+side*w/2,y,z+.08],[.09,h+.15,.12])
    b.box('wood','#70553c',[x,y+side*h/2,z+.08],[w+.15,.09,.12])
  }
  for(let i=-1;i<=1;i++)b.box('wood','#ab9161',[x+i*w/4,y,z+.12],[.035,h,.05])
}
const store=new PropBuilder([14,9])
store.box('stone','#b8b09c',[0,.15,0],[9.8,.3,7.4])
store.box('paint','#d5c7a9',[0,2.25,0],[9.6,3.9,7.2])
for(const x of [-4.6,4.6])for(const z of [-3.45,3.45]){
  store.box('stone','#a59d89',[x,.43,z],[.55,.26,.55])
  store.cylinder('wood','#735333',[x,2.4,z],.15,.19,3.8)
}
glazedWindow(store,0,2.05,3.65,2.2,3.2)
for(const side of [-1,1]){
  glazedWindow(store,side*3.05,2.3,3.65,2.35,1.7)
  store.box('wood','#805a36',[side*3.15,1.06,4.04],[2.35,1.25,.78])
  store.box('wood','#b29361',[side*3.15,1.73,4.08],[2.55,.13,1])
  for(let i=0;i<4;i++){
    const x=side*3.15+(i-1.5)*.44
    store.lathe('paint',i%2?'#a47e51':'#b5a183',[x,1.8,4.05],[[.14,0],[.19,.1],[.21,.3],[.14,.42],[.13,.46]])
    store.cylinder('wood','#6b5035',[x,2.29,4.05],.15,.15,.05)
  }
}
for(const y of [3.95,4.25])store.box('wood','#82603b',[0,y,0],[10.1,.16,7.6])
hipRoof(store,11.2,9.4,4.65,1.6)
store.box('glow','#ffd69d',[0,3.95,3.82],[7.8,.1,.08])
for(const side of [-1,1]){
  store.cylinder('wood','#735333',[side*4.15,2.1,4.2],.1,.13,3.7)
  store.box('glow','#f4cc88',[side*4.15,3.55,4.4],[.24,.46,.24])
  store.box('tile','#384d45',[side*4.15,3.83,4.4],[.4,.1,.4])
}
const entry=new PropBuilder([14,9])
entry.box('stone','#bbb4a2',[0,.16,0],[8.1,.32,5.3])
entry.box('paint','#e3d4b2',[0,1.8,-2.35],[7.8,3,.24])
for(const side of [-1,1]){
  entry.box('wood','#6e5740',[side*3.65,2.1,0],[.2,3.8,4.9])
  entry.box('paint','#a4b6a3',[side*3.35,1.1,0],[.15,1.5,4.4])
}
entry.box('wood','#8c714f',[0,.91,1.5],[6.2,1.15,.92])
entry.box('wood','#c2a87c',[0,1.54,1.55],[6.5,.16,1.1])
for(let i=-2;i<=2;i++)entry.box('paint','#b8c2ac',[i*1.08,.95,1.98],[.85,.68,.03])
entry.box('paint','#9f5e4c',[0,4.02,0],[9.2,.2,6.4])
entry.box('paint','#c58e75',[0,4.18,0],[8.4,.18,5.6])
for(let i=0;i<12;i++)entry.box('paint',i%2?'#b57560':'#eadac1',[-4.2+(i+.5)*.7,3.8,3.1],[.68,.37,.08])
for(const side of [-1,1])entry.box('wood','#67503b',[side*3.8,2.12,2.55],[.18,3.85,.18])
entry.box('paint','#567668',[-1,1.97,1.55],[.9,.7,.75])
entry.box('gold','#c4aa70',[-1,2.34,1.55],[.96,.08,.8])
entry.box('metal','#253a34',[-1,2.39,1.55],[.55,.012,.065])
entry.ring('gold','#bfa16a',[1.4,2.13,1.55],.48,.035)
entry.ball('paint','#a8bb9d',[1.4,2.13,1.52],[.42,.42,.15])
for(let i=0;i<8;i++)entry.box('metal','#586657',[1.4,2.13,1.75],[.88,.025,.025],[0,0,i*Math.PI/4])
for(const side of [-1,1]){
  entry.box('wood','#76583d',[1.4+side*.6,1.91,1.5],[.11,.66,.11])
  entry.cylinder('metal','#394d43',[side*2.85,.77,3.25],.035,.06,1.25)
  entry.ball('gold','#baa16d',[side*2.85,1.43,3.25],[.09,.09,.09])
}
const photo=new PropBuilder([16,10])
photo.box('stone','#b5b2a5',[0,.17,0],[9,.34,6.8])
photo.box('paint','#d9d5c5',[0,2.3,0],[8.8,4,6.6])
photo.box('paint','#345c58',[0,4.42,0],[9.6,.28,7.4])
photo.box('metal','#63796c',[0,4.64,0],[9.1,.16,7])
photo.box('paint','#385a58',[-1,2.15,3.35],[4.5,3.3,.1])
for(const x of [-3.3,1.3])photo.box('wood','#b29b75',[x,2.15,3.46],[.16,3.5,.18])
photo.box('wood','#b29b75',[-1,3.88,3.46],[4.75,.16,.18])
photo.box('paint','#afafa2',[-1,2.1,3.43],[1.85,3.1,.04])
for(const side of [-1,1])for(let i=0;i<8;i++)photo.box('paint',i%2?'#8e8785':'#b0a799',[side*.87-1,2.1,3.48+i*.007],[.08,3.05,.035])
photo.box('paint','#23433e',[2.9,2,3.39],[2.3,3.3,.1])
photo.box('metal','#263b39',[0,5.1,2.2],[2.5,1.55,.65])
photo.box('metal','#405d54',[-.7,6.01,2.2],[.75,.32,.55])
photo.cylinder('metal','#9d9275',[0,5.12,2.68],.65,.65,.37,[Math.PI/2,0,0],48)
photo.cylinder('paint','#2f6468',[0,5.12,2.9],.49,.49,.06,[Math.PI/2,0,0],48)
photo.cylinder('paint','#8ba3a0',[.12,5.24,2.94],.14,.14,.012,[Math.PI/2,0,0],24)
photo.box('glow','#e6d5a6',[.9,5.42,2.57],[.35,.25,.08])
photo.box('metal','#2c3d36',[-3.7,1.1,3.5],[.8,.17,.15])
photo.box('paint','#ebe3d2',[-3.7,.91,3.56],[.55,.3,.02])
photo.box('glow','#ffe0b4',[0,3.95,3.66],[7.7,.1,.08])
const art={shop:store.finish(),drink:entry.finish(),photo:photo.finish()}
const titles={shop:'상점',drink:'응모부스',photo:'포토부스'}
function title(kind:Kind){return(c:CanvasRenderingContext2D,w:number,h:number)=>{
  c.fillStyle=kind==='drink'?'#ead6b1':'#e8dfc7';c.fillRect(0,0,w,h);c.strokeStyle='#876b43';c.lineWidth=12;c.strokeRect(8,8,w-16,h-16)
  c.fillStyle='#284e43';c.font='700 '+h*.58+'px "Malgun Gothic",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(titles[kind],w/2,h*.51,w*.9)
}}
function poster(kind:Kind){return(c:CanvasRenderingContext2D,w:number,h:number)=>{
  c.fillStyle='#e8dfca';c.fillRect(0,0,w,h);c.textAlign='center';c.fillStyle='#37594a'
  if(kind==='photo')for(let i=0;i<4;i++){
    const y=h*(.04+i*.24);c.fillStyle=['#a7b4a0','#c6b3a6','#a2b8b5','#c6bc9d'][i]!;c.fillRect(w*.1,y,w*.8,h*.21)
    c.fillStyle='#526959';c.beginPath();c.arc(w*.5,y+h*.065,w*.1,0,Math.PI*2);c.fill();c.fillRect(w*.34,y+h*.105,w*.32,h*.09)
  }else{
    c.font='700 '+w*.19+'px "Malgun Gothic",sans-serif';c.fillText('참여 안내',w*.5,h*.14)
    c.font=w*.14+'px "Malgun Gothic",sans-serif';['01 참여하기','02 응모하기','03 결과 확인'].forEach((t,i)=>c.fillText(t,w*.5,h*(.36+i*.22)))
  }
}}
export function PlazaBuilding({kind}:{kind:Kind}){
  const k=KIOSKS.find(k=>k.kind===kind)!
  return <group name={'layout-'+kind} position={[k.x,0,k.z]} rotation={[0,k.yaw,0]} userData={{previewRole:kind}}>
    <PropModel art={art[kind]} name={kind+'-draft-building'}/>
    <PropSign position={kind==='shop'?[0,4.07,4.24]:kind==='drink'?[0,3.25,2.7]:[0,3.75,3.62]} width={kind==='shop'?4.2:4} height={.65} draw={title(kind)}/>
    {kind!=='shop'&&<PropSign position={kind==='drink'?[-2.65,2.65,2.66]:[2.9,2.1,3.52]} width={kind==='drink'?1.4:1.1} height={kind==='drink'?1.75:2.5} draw={poster(kind)}/>}
  </group>
}
