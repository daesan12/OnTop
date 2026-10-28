import { ExtrudeGeometry, Shape } from 'three'
import { PropBuilder, type XYZ } from './propGeometry'
import { blossom, carvedBox, fineCurve, giwaRoof, reliefPagoda } from './heritageGeometry'

const darkRed='#74251f', brass='#c6a064'
function plaqueShape(scale=1) {
  const s=new Shape()
  s.moveTo(-.315*scale,-.09*scale);s.lineTo(.315*scale,-.09*scale)
  s.lineTo(.315*scale,.057*scale);s.quadraticCurveTo(.25*scale,.06*scale,.23*scale,.097*scale)
  s.quadraticCurveTo(.09*scale,.101*scale,0,.162*scale)
  s.quadraticCurveTo(-.09*scale,.101*scale,-.23*scale,.097*scale)
  s.quadraticCurveTo(-.25*scale,.06*scale,-.315*scale,.057*scale);s.closePath()
  return s
}
function stonePlinth(b:PropBuilder,detailed:boolean) {
  carvedBox(b,'stone','#91887b',[0,.033,0],[.90,.066,.75],.012)
  carvedBox(b,'stone','#b5a690',[0,.083,0],[.87,.035,.71],.008)
  b.box('stone','#5c5c53',[0,.175,0],[.82,.17,.65])
  for(const side of [-1,1]) {
    carvedBox(b,'stone','#a29681',[0,.178,side*.327],[.43,.145,.026],.008)
    for(const x of [-.31,.31]) {
      carvedBox(b,'stone','#a39781',[x,.178,side*.329],[.17,.145,.031],.008)
      if(detailed) {
        carvedBox(b,'stone','#655f55',[x,.178,side*.348],[.123,.105,.008],.002)
        blossom(b,'stone','#b6a17e',x,.178,side*.354,.043)
      }
    }
    if(detailed) {
      carvedBox(b,'stone','#5e5b52',[0,.178,side*.348],[.38,.103,.008],.002)
      reliefPagoda(b,0,.126,side*.356,.39,'#c3b08b','stone')
    }
  }
  for(const side of [-1,1]) {
    carvedBox(b,'stone','#a79b85',[side*.413,.178,0],[.025,.145,.47],.007)
    if(detailed)for(const z of [-.17,0,.17])carvedBox(b,'stone',z?'#aaa08a':'#938a77',[side*.427,.178,z],[.007,.107,.145],.002)
  }
  carvedBox(b,'stone','#b8a992',[0,.278,0],[.86,.055,.71],.009)
  carvedBox(b,'stone','#57584f',[0,.322,0],[.78,.034,.59],.005)
}
function build(detailed:boolean) {
  const b=new PropBuilder([8,4],`mailbox-hanok-v2-${detailed}`)
  stonePlinth(b,detailed)
  carvedBox(b,'wood',darkRed,[0,.935,0],[.70,1.19,.50],.012)
  // Separate lacquered boards, routed joinery and gently worn raised stiles.
  for(let i=0;i<(detailed?6:3);i++) {
    const count=detailed?6:3,x=-.3+(i+.5)*.6/count
    carvedBox(b,'wood',i%2?'#ad3429':'#a02b23',[x,.943,-.255],[.6/count-.005,1.125,.019],.003)
  }
  for(const side of [-1,1]) {
    carvedBox(b,'wood','#b2382a',[side*.333,.944,0],[.07,1.19,.535],.009)
    carvedBox(b,'wood','#8e2b23',[side*.35,.946,-.005],[.032,1.08,.44],.006)
    if(detailed) {
      for(let plank=0;plank<3;plank++)carvedBox(b,'wood',plank%2?'#a32f24':'#b03427',[side*.369,.94,-.16+plank*.151],[.008,1.06,.145],.002)
      for(const y of [.54,.585,.63]) {
        carvedBox(b,'wood','#62221d',[side*.376,y,-.025],[.009,.017,.19],.003)
        b.box('wood','#cb5440',[side*.378,y-.012,-.025],[.005,.003,.18])
      }
      fineCurve(b,'wood','#d06a4a',[[side*.36,.49,-.20],[side*.36,.73,-.202],[side*.36,.86,-.20]],.0015,4)
    }
  }
  carvedBox(b,'wood','#81261f',[0,.374,0],[.767,.07,.56],.008)
  carvedBox(b,'gold',brass,[0,.404,.004],[.75,.012,.555],.002)
  carvedBox(b,'wood','#a03225',[0,1.515,0],[.76,.07,.56],.007)
  giwaRoof(b,{width:.88,depth:.748,ridge:1.72,eave:1.555,rolls:5,detailed,redEnds:true})
  b.add('gold',new ExtrudeGeometry(plaqueShape(),{depth:.014,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,curveSegments:6}),brass,[0,1.317,.263])
  b.add('stone',new ExtrudeGeometry(plaqueShape(.95),{depth:.006,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1,curveSegments:6}),'#efdbb3',[0,1.317,.282])
  // The slot reads as a deep dark recess with a brass liner and a projecting rain lip.
  carvedBox(b,'gold',brass,[0,1.105,.285],[.615,.122,.045],.007)
  carvedBox(b,'stone','#201812',[0,1.107,.313],[.561,.074,.006],.003)
  carvedBox(b,'wood','#c04430',[0,1.174,.299],[.645,.026,.071],.005)
  b.box('gold','#e0b974',[0,1.065,.318],[.555,.005,.004])
  carvedBox(b,'wood','#68211c',[0,.719,.269],[.63,.636,.029],.008)
  carvedBox(b,'wood','#b43728',[0,.716,.291],[.59,.596,.02],.008)
  if(detailed)for(let i=0;i<5;i++){
    const x=-.227+i*.113
    b.box('wood',i%2?'#a32c23':'#ad3024',[x,.713,.303],[.108,.567,.002])
    fineCurve(b,'wood','#c24a35',[[x-.02,.47,.305],[x-.017,.55,.305],[x-.022,.68,.305]],.0012,4)
  }
  for(const x of [-.274,.274])carvedBox(b,'gold',brass,[x,.714,.31],[.006,.548,.004],.001)
  for(const y of [.442,.986])carvedBox(b,'gold',brass,[0,y,.31],[.551,.006,.004],.001)
  reliefPagoda(b,0,.454,.315,.78,brass)
  // Raised envelope; fine diagonals remain visible at the normal interaction distance.
  carvedBox(b,'gold',brass,[0,.839,.316],[.237,.155,.008],.004)
  carvedBox(b,'wood','#a72e25',[0,.839,.322],[.221,.139,.004],.003)
  fineCurve(b,'gold','#d9b975',[[-.109,.903,.327],[0,.819,.327],[.109,.903,.327]],.004,5)
  if(detailed) {
    for(const side of [-1,1]) {
      const points:XYZ[]=Array.from({length:13},(_,i)=>{
        const t=i/12,a=t*Math.PI*3.5
        return[side*(.11+.092*t),.493+Math.sin(a)*(.009+.009*t),.319]
      })
      fineCurve(b,'gold',brass,points,.003,12)
      for(const y of [.526,.89]){
        carvedBox(b,'gold',brass,[-.316,y,.315],[.024,.09,.012],.003)
        b.cylinder('gold','#d2ae6a',[-.302,y,.33],.012,.012,.085,undefined,8)
        for(const pinY of [-.03,.03])b.cylinder('metal','#7d623d',[-.317,y+pinY,.325],.003,.003,.004,[Math.PI/2,0,0],6)
      }
      for(const y of [.43,1.48])b.cylinder('gold',brass,[side*.333,y,.278],.005,.005,.005,[Math.PI/2,0,0],6)
    }
    b.cylinder('gold','#d6b46e',[.215,.713,.326],.036,.036,.012,[Math.PI/2,0,0],12)
    b.cylinder('stone','#493321',[.215,.722,.335],.009,.009,.004,[Math.PI/2,0,0],8)
    carvedBox(b,'stone','#493321',[.215,.709,.336],[.008,.022,.003],.001)
  }
  return b.finish()
}
export const mailboxArt={near:build(true),far:build(false)}
export function mailboxTitle(c:CanvasRenderingContext2D,w:number,h:number) {
  c.clearRect(0,0,w,h);c.strokeStyle='#74432c';c.lineWidth=h*.022;c.lineCap='round';c.lineJoin='round'
  c.beginPath();c.moveTo(w*.425,h*.24);c.lineTo(w*.5,h*.105);c.lineTo(w*.575,h*.24);c.stroke()
  c.beginPath();c.moveTo(w*.455,h*.215);c.lineTo(w*.455,h*.31);c.moveTo(w*.545,h*.215);c.lineTo(w*.545,h*.31);c.stroke()
  c.fillStyle='#603923';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.34}px "BusanDandiMyeongjo","Malgun Gothic",serif`;c.fillText('온탑 소리함',w/2,h*.58,w*.95)
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.fillStyle=i%2?'#cb713f':'#db985a';c.beginPath();c.ellipse(w*.5+Math.cos(a)*h*.037,h*.855+Math.sin(a)*h*.037,h*.03,h*.03,0,0,Math.PI*2);c.fill()}
  c.fillStyle='#b68d46';c.beginPath();c.arc(w/2,h*.855,h*.017,0,Math.PI*2);c.fill()
}
export function mailboxNote(c:CanvasRenderingContext2D,w:number,h:number) {
  c.fillStyle='#b58c4e';c.fillRect(0,0,w,h);c.fillStyle='#5d3020';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.49}px "Malgun Gothic",sans-serif`;c.fillText('여러분의 목소리를 들려주세요',w/2,h/2,w*.92)
}
