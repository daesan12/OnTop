import {PropBuilder} from '../../../../src/world/art/propGeometry.ts'
import {PropModel} from '../../../../src/world/art/PropModel.tsx'
import {PropSign} from '../../../../src/world/art/CraftedProp.tsx'
import {FIRST_REEL,SECOND_REEL,OPERATOR_REEL,JACKPOT} from '../../../../src/features/plusMinus/protocol.ts'

const b=new PropBuilder(),blue='#285ca1',dark='#172b45'
b.box('metal',dark,[0,.45,-.05],[.94,.9,.7])
b.box('paint',blue,[0,1.44,-.1],[.94,1.08,.58])
b.box('paint','#f0d6a0',[0,1.99,-.06],[.98,.1,.66])
b.box('metal',dark,[0,1.46,.2],[.88,1,.08])
b.box('paint',blue,[0,.94,.19],[.94,.12,.42],[-.2,0,0])
for(const [i,x]of [-.25,0,.25].entries())b.cylinder('paint',['#cc6654','#deb956','#8aaf8f'][i]!,[x,1.05,.34],.07,.075,.045)
b.box('paint',blue,[0,.59,.31],[.68,.26,.12])
b.box('metal','#101923',[0,.22,.314],[.25,.05,.08])
const art=b.finish()

/** The same number/operator order as the existing 2D machine, shown as a static attract screen. */
export function plusMinusCabinetFace(c:CanvasRenderingContext2D,w:number,h:number){
 c.save();c.scale(w/600,h/650)
 c.fillStyle='#2c58a6';c.fillRect(0,0,600,650);c.strokeStyle='#f8e7ae';c.lineWidth=10;c.strokeRect(5,5,590,640)
 c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ffe7a2';c.font='800 36px "Malgun Gothic",sans-serif';c.fillText('더하기 · 빼기',300,40)
 const ring=(cx:number,cy:number,r:number,labels:readonly string[],value:string)=>{
  const step=Math.PI*2/labels.length
  labels.forEach((label,i)=>{
   const a=i*step-Math.PI/2,on=label==='JP'
   c.beginPath();c.arc(cx,cy,r,a-step/2,a+step/2);c.arc(cx,cy,r*.6,a+step/2,a-step/2,true);c.closePath()
   c.fillStyle=on?'#e9b02e':i%2?'#523e24':'#302b24';c.fill();c.strokeStyle='#f9e4ae';c.lineWidth=2;c.stroke()
   c.fillStyle=on?'#462f14':'#ffe2a1';c.font=`800 ${label==='JP'?15:21}px sans-serif`;c.fillText(label,cx+Math.cos(a)*r*.8,cy+Math.sin(a)*r*.8)
  })
  c.beginPath();c.arc(cx,cy,r*.58,0,Math.PI*2);c.fillStyle='#250a0b';c.fill()
  c.fillStyle='#ff6e4c';c.font='800 54px monospace';c.fillText(value,cx,cy)
 }
 ring(300,157,77,OPERATOR_REEL.map(x=>x==='-'?'−':x),'+')
 ring(148,356,127,FIRST_REEL.map(String),'7')
 ring(452,356,127,SECOND_REEL.map(x=>x===JACKPOT?'JP':String(x)),'5')
 c.fillStyle='#230909';c.fillRect(55,511,490,68);c.strokeStyle='#d4a24c';c.lineWidth=4;c.strokeRect(55,511,490,68)
 c.fillStyle='#ffb965';c.font='800 39px monospace';c.fillText('7 + 5 = 12',300,545)
 c.fillStyle='#f5e2bd';c.font='700 22px "Malgun Gothic",sans-serif';c.fillText('1 정지  ·  2 정지  ·  3 정지',300,604)
 c.font='500 14px sans-serif';c.fillText('DEMO  ·  대기 화면',300,630);c.restore()
}
function startLabel(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle=blue;c.fillRect(0,0,w,h);c.fillStyle='#fff0bc';c.textAlign='center';c.textBaseline='middle';c.font=`800 ${h*.65}px sans-serif`;c.fillText('START',w/2,h/2)
}
/** Visual only; importing this model never starts a game or requests a balance. */
export function PlusMinusCabinetModel(){
 return <group name="plus-minus-cabinet-model">
  <PropModel art={art} name="plus-minus-cabinet-body"/>
  <PropSign width={.84} height={.94} position={[0,1.46,.249]} draw={plusMinusCabinetFace}/>
  <PropSign width={.58} height={.17} position={[0,.59,.376]} draw={startLabel}/>
 </group>
}
