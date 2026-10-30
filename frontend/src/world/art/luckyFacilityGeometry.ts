import { BufferGeometry,CylinderGeometry,Float32BufferAttribute } from 'three'
import { WHEEL_VALUES,wheelColor } from '../../features/luckyFacilities/wheel'
import { PropBuilder, hipRoof, type XYZ } from './propGeometry'
import { connectRoof } from '../../layout-preview/plazaBuildingStructure'

const wood = '#a36b37', dark = '#593b2a', cream = '#f3dfb2'
function roofUnderside(b:PropBuilder){
  // Close every roof facet with a 12cm underside. Timber intersects the volume,
  // while staying below the visible top face instead of poking through it.
  for(const geometry of [...b.parts.tile]){
    const g=geometry.index?geometry.toNonIndexed():geometry.clone(),p=g.getAttribute('position'),vertices:number[]=[]
    for(let n=0;n<p.count;n+=3){
      const top=[0,1,2].map(i=>[p.getX(n+i),p.getY(n+i),p.getZ(n+i)] as XYZ)
      const bottom=top.map(([x,y,z])=>[x,y-.12,z] as XYZ)
      vertices.push(...bottom[2]!,...bottom[1]!,...bottom[0]!)
      for(let i=0;i<3;i++){
        const j=(i+1)%3
        vertices.push(...top[i]!,...bottom[i]!,...top[j]!,...top[j]!,...bottom[i]!,...bottom[j]!)
      }
    }
    g.dispose()
    const underside=new BufferGeometry();underside.setAttribute('position',new Float32BufferAttribute(vertices,3));underside.computeVertexNormals()
    b.add('tile',underside,'#414957')
  }
}
/** All structural joins overlap. Roof seats sample the actual low-poly roof faces. */
function house(width:number, depth:number, counter=false) {
  const b=new PropBuilder([8,4])
  b.box('stone','#99958a',[0,.12,0],[width+.4,.24,depth+.4])
  b.box('stone','#d5c8aa',[0,.29,0],[width,.12,depth])
  b.box('paint',cream,[0,2.25,-depth/2+.18],[width-.25,3.82,.24])
  for(const x of [-width/2+.16,width/2-.16]){
    b.box('paint','#ddbd86',[x,2.25,0],[.22,3.82,depth-.2])
    for(const z of [-depth/2+.2,depth/2-.2]){
      b.box('stone','#8e8878',[x,.48,z],[.52,.35,.52])
      b.box('wood',wood,[x,2.45,z],[.32,3.95,.32])
      b.box('wood',dark,[x,4.09,z],[.7,.26,.65])
    }
    b.box('wood',wood,[x,4.16,0],[.34,.32,depth])
    b.box('wood',dark,[x,.53,0],[.3,.3,depth])
  }
  for(const z of [-depth/2+.2,depth/2-.2])b.box('wood',dark,[0,4.17,z],[width,.34,.36])
  hipRoof(b,width+1.4,depth+1.4,4.65,1.25)
  roofUnderside(b)
  connectRoof(b,width,depth,-.075)
  for(const x of [-width*.32,width*.32]){
    // Sign rests on a continuous bracket running back into the front beam.
    b.box('wood',dark,[x,4.23,depth/2+.12],[.18,.26,1.1])
  }
  b.box('wood',dark,[0,4.27,depth/2+.48],[width*.69,.98,.24])
  b.box('paint',cream,[0,4.27,depth/2+.615],[width*.64,.76,.04])
  for(const x of [-width/2+.34,width/2-.34]){
    b.box('wood',dark,[x,3.83,depth/2+.2],[.2,.2,.9])
    b.box('metal','#514535',[x,3.48,depth/2+.5],[.06,.6,.06])
    b.box('glow','#ffce79',[x,3.09,depth/2+.5],[.38,.6,.38])
    for(const y of [2.76,3.42])b.box('wood',dark,[x,y,depth/2+.5],[.52,.12,.52])
  }
  if(counter){
    b.box('wood',wood,[0,1.05,depth/2-.65],[width-.8,1.4,1.05])
    b.box('wood','#d09b56',[0,1.8,depth/2-.65],[width-.5,.16,1.3])
    for(let x=-width/2+.7;x<width/2-.3;x+=.55)b.box('wood',dark,[x,1.07,depth/2-.1],[.045,1.35,.04])
  }
  return b
}

function wheel(b:PropBuilder){
  const cy=2.15,z=1.95,r=1.5
  // Feet, axle and frame make the wheel a single supported object.
  for(const x of [-1.18,1.18]){
    b.box('wood',dark,[x,.44,z],[.5,.24,1.5])
    b.box('wood',wood,[x,1.43,z-.3],[.23,2.1,.32],[0,0,x>0?.18:-.18])
  }
  b.box('wood',dark,[0,.69,z],[2.8,.22,.32])
  b.box('wood',dark,[0,cy,z-.36],[2.85,.26,.32])
  b.cylinder('metal','#795d35',[0,cy,z],.16,.16,1.1,[Math.PI/2,0,0],8)
  b.cylinder('wood',dark,[0,cy,z+.05],r+.12,r+.12,.22,[Math.PI/2,0,0],40)
  WHEEL_VALUES.forEach((value,i)=>{
    const angle=i*Math.PI*2/WHEEL_VALUES.length-Math.PI/WHEEL_VALUES.length
    b.add('paint',new CylinderGeometry(r,r,.06,2,1,false,angle,Math.PI*2/WHEEL_VALUES.length),wheelColor(value),[0,cy,z+.19],[1,1,1],[Math.PI/2,0,0])
  })
  b.cylinder('wood','#c69458',[0,cy,z+.25],.64,.64,.15,[Math.PI/2,0,0],20)
  b.cylinder('gold','#d8af56',[0,cy,z+.36],.21,.21,.16,[Math.PI/2,0,0],8)
  // Pointer overlaps the crossbeam and the wheel rim.
  b.box('wood',dark,[0,3.89,z+.12],[.23,.47,.25])
  b.add('paint',new CylinderGeometry(.24,.24,.12,3),'#b84132',[0,3.73,z+.34],[1,1,1],[Math.PI/2,0,Math.PI])
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10;b.ball('gold','#d7b46e',[Math.sin(a)*(r+.075),cy+Math.cos(a)*(r+.075),z+.19],[.045,.045,.045])
  }
}
const lucky=house(9.2,6.6);wheel(lucky)
for(const x of [-3.1,3.1]){
  lucky.box('wood',dark,[x,1.45,-1.2],[1.4,.14,1.1])
  lucky.box('wood',wood,[x,.87,-1.2],[.18,1.16,.7])
  for(let i=0;i<3;i++)gift(lucky,[x-.4+i*.4,1.76,-1.2],['#cf6a4c','#5d9290','#d5b256'][i]!)
}
export const luckyRoomArt=lucky.finish()

function gift(b:PropBuilder,p:XYZ,color:string){
  b.box('paint',color,p,[.36,.4,.36]);b.box('gold','#e9c16b',p,[.07,.42,.38])
  b.box('gold','#e9c16b',[p[0],p[1]+.22,p[2]],[.4,.06,.08])
}
const lottery=house(7.6,4.8,true)
for(const x of [-2.6,0,2.6]){
  lottery.box('wood',dark,[x,1.42,-1.65],[1.7,2.15,.23])
  for(const y of [.64,1.28,1.92,2.56]){
    lottery.box('wood',wood,[x,y,-1.28],[1.8,.1,.8])
    for(let n=0;n<4;n++){
      const xx=x-.6+n*.4
      lottery.box('paint',['#ca7256','#799989','#dcb65e'][n%3]!,[xx,y+.26,-1.27],[.29,.4,.32])
      lottery.box('paint',cream,[xx,y+.26,-1.09],[.21,.19,.025])
    }
  }
}
for(let n=0;n<5;n++)lottery.box('paint',n%2?'#dd9f65':'#f2db9b',[-1.35+n*.56,1.98,1.65],[.42,.28,.52],[.25,0,0])
lottery.box('wood',dark,[2.35,2.25,1.45],[1.15,.8,.16],[.1,0,0])
lottery.box('paint','#456f59',[2.35,2.25,1.55],[1,.65,.03],[.1,0,0])
for(let i=0;i<3;i++){
  const x=-2.45+i*2.45
  lottery.box('wood',dark,[x,3.86,2.15],[.12,.2,.65])
  lottery.box('paint',cream,[x,3.42,2.43],[2.38,.86,.06])
  lottery.ball('paint','#ce7250',[x,3.43,2.48],[.15,.15,.025])
}
export const lotteryRoomArt=lottery.finish()

const fish=house(9.2,6.6,true)
// Red-and-cream awning is tucked into the front beam, with a continuous support rail.
fish.box('wood',dark,[0,3.76,3.08],[9,.18,.2])
for(let n=0;n<12;n++){
  const x=-4.4+(n+.5)*8.8/12,color=n%2?'#f5e4be':'#b84c38'
  fish.box('paint',color,[x,3.56,3.52],[8.8/12+.015,.09,1.3],[.29,0,0])
  fish.box('paint',color,[x,3.13,4.1],[8.8/12+.015,.5,.08])
}
// The counter and display are within the solid footprint; the serving apron remains walkable.
fish.box('paint','#ad4935',[0,1.07,3.21],[7.8,1.3,.08])
fish.box('metal','#3b403e',[-1.4,1.95,2.5],[2.8,.17,1.07])
for(const x of [-2.3,-1.4,-.5])for(const z of [2.23,2.76]){
  fish.ball('metal','#272e2d',[x,2.04,z],[.28,.045,.18])
}
for(const y of [1.93,2.43]){
  fish.box('wood','#cb9454',[2.2,y,2.6],[2.45,.1,.95])
  for(let n=0;n<5;n++){
    const x=1.25+n*.45
    fish.ball('paint','#e9af4d',[x,y+.14,2.65],[.18,.12,.09])
    fish.box('paint','#d9953c',[x+.19,y+.14,2.65],[.12,.14,.13],[0,0,.5])
  }
}
for(const x of [1,3.4])fish.box('wood',wood,[x,2.18,2.6],[.12,.85,1])
fish.box('wood',dark,[3.25,2.8,-.2],[1.45,1.9,.16])
fish.box('paint','#34443b',[3.25,2.8,-.1],[1.25,1.7,.04])
for(const y of [1.05,2.1])fish.box('wood',wood,[-.5,y,-2.65],[6.5,.12,.7])
for(let n=0;n<8;n++)fish.cylinder('paint',n%2?'#d5b17a':'#b56641',[-3+n*.7,1.35,-2.65],.16,.2,.48)
export const fishBreadShopArt=fish.finish()

export function facilitySign(label:string,subtitle=''){
  return (c:CanvasRenderingContext2D,w:number,h:number)=>{
    c.fillStyle=cream;c.fillRect(0,0,w,h)
    c.strokeStyle='#bd9454';c.lineWidth=8;c.strokeRect(5,5,w-10,h-10)
    c.fillStyle=dark;c.textAlign='center';c.textBaseline='middle'
    c.font=`800 ${h*(subtitle?.43:.58)}px "Malgun Gothic",sans-serif`
    c.fillText(label,w/2,h*(subtitle?.4:.53),w*.89)
    if(subtitle){c.fillStyle='#a65b3c';c.font=`600 ${h*.18}px "Malgun Gothic",sans-serif`;c.fillText(subtitle,w/2,h*.79,w*.85)}
  }
}
export const luckyRoomSign=facilitySign('행운 뽑기방','돌려보는 오늘의 행운')
export const lotteryRoomSign=facilitySign('복권방','작은 기대, 커다란 설렘')
export const fishBreadShopSign=facilitySign('붕어빵','갓 구운 따끈한 한 입')
export const fishMenuSign=facilitySign('오늘의 메뉴','팥 · 슈크림')
export function wheelFace(c:CanvasRenderingContext2D,w:number,h:number){
  const cx=w/2,cy=h/2,r=w*.49,step=Math.PI*2/WHEEL_VALUES.length
  c.textAlign='center';c.textBaseline='middle';c.font=`800 ${w*.052}px "Malgun Gothic",sans-serif`
  WHEEL_VALUES.forEach((value,i)=>{
    const a=-Math.PI/2+i*step
    c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,r,a-step/2,a+step/2);c.closePath()
    c.fillStyle=wheelColor(value);c.fill();c.strokeStyle='#694d32';c.lineWidth=2;c.stroke()
    c.save();c.translate(cx+Math.cos(a)*r*.79,cy+Math.sin(a)*r*.79);c.rotate(a+Math.PI/2)
    c.fillStyle='#fff0c8';c.fillText(String(value),0,0);c.restore()
  })
  c.fillStyle='#c69458';c.beginPath();c.arc(cx,cy,r*.39,0,Math.PI*2);c.fill()
  c.strokeStyle='#694d32';c.lineWidth=w*.014;c.stroke()
  c.fillStyle='#694725';c.font=`800 ${w*.15}px serif`;c.fillText('福',cx,cy)
}
