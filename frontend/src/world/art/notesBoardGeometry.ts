import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape, TorusGeometry } from 'three'
import { PropBuilder, type XYZ } from './propGeometry'
import { carvedBox, fineCurve, leaf, softBall } from './heritageGeometry'
import { memoRoof } from './notesRoofGeometry'
import { MEMO_ATLAS_GRID, memoSlips } from './notesBoardLayout'

function invitationShape() {
  const s=new Shape();s.moveTo(-.115,-.06);s.quadraticCurveTo(-.135,.065,-.07,.103)
  s.quadraticCurveTo(0,.137,.081,.103);s.quadraticCurveTo(.144,.069,.122,-.057)
  s.quadraticCurveTo(.095,-.111,0,-.108);s.quadraticCurveTo(-.09,-.115,-.115,-.06);return s
}
function lantern(b:PropBuilder,side:number,detailed:boolean) {
  const x=side*.552,y=1.205,z=.13
  carvedBox(b,'wood','#67472c',[side*.50,y+.13,.005],[.11,.032,.21],.004)
  b.cylinder('glow','#d48e37',[x,y,z],.047,.044,.167,undefined,10)
  for(const dx of [-.047,.047])for(const dz of [-.047,.047])carvedBox(b,'wood','#66442b',[x+dx,y,z+dz],[.009,.192,.009],.0015)
  for(const dy of [-.101,.101]) {
    carvedBox(b,'wood','#79522e',[x,y+dy,z],[.136,.026,.135],.005)
    if(detailed)carvedBox(b,'gold','#af8447',[x,y+dy*.90,z],[.117,.006,.12],.001)
  }
  carvedBox(b,'wood','#5c402a',[x,y+.128,z],[.163,.024,.165],.004)
  fineCurve(b,'wood','#98703e',[[x-.079,y+.137,z+.08],[x-.035,y+.125,z+.083],[x+.035,y+.125,z+.083],[x+.079,y+.137,z+.08]],.006,8)
  if(detailed) {
    b.add('gold',new TorusGeometry(.012,.0024,4,10),'#b28e51',[x,y+.155,z])
    for(const dy of [-.048,.045])fineCurve(b,'wood','#79542e',[[x-.045,y+dy,z+.048],[x+.045,y+dy,z+.048]],.0028,2)
  }
}
function flowerCluster(b:PropBuilder,x:number,y:number,z:number,wide:boolean) {
  for(let i=0;i<(wide?11:6);i++) {
    const px=x+Math.cos(i*2.4)*(wide?.071:.054),pz=z+Math.sin(i*2.4)*.04,py=y+.10+(i%4)*.024
    fineCurve(b,'stone','#526c37',[[px,py,pz],[px-.01,py-.065,pz],[x,y,z]],.002,4)
    leaf(b,px-.017,py-.048,pz+.012,.026,-.9-i*.22,i%2?'#758844':'#4c6b38')
    leaf(b,px+.017,py-.063,pz+.016,.022,.8+i*.18,'#63813f')
    for(let p=0;p<6;p++) {
      const a=p*Math.PI*2/6
      b.ball('stone',i%3?'#f2e9cd':'#fff4db',[px+Math.cos(a)*.016,py+Math.sin(a)*.016,pz+.012],[.011,.010,.005])
    }
    b.ball('gold','#c8a04f',[px,py,pz+.019],[.006,.006,.003])
  }
}
function foliage(b:PropBuilder) {
  // One larger, weathered terracotta pot; the left flowers grow on the board ledge.
  const x=.482,y=.1525,z=.26
  b.cylinder('stone','#a69579',[x,y-.075,z],.103,.075,.155,undefined,10)
  b.cylinder('stone','#c7b799',[x,y+.006,z],.110,.104,.027,undefined,10)
  b.cylinder('stone','#5c4b36',[x,y+.022,z],.094,.094,.006,undefined,10)
  flowerCluster(b,x,y+.02,z,true)
  flowerCluster(b,-.414,.612,.207,false)
  for(let i=0;i<6;i++)leaf(b,-.49+(i%2?-.009:.011),.73-i*.032,.219,.024,(i%2?-.8:.7),'#64783d')
}
function paper(b:PropBuilder,index:number,detailed:boolean) {
  const slip=memoSlips[index]!,n=detailed?5:1,p:number[]=[],uv:number[]=[],triangles:number[]=[]
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++) {
    const u=i/n,v=j/n,curl=Math.pow(v,3)*(.007+.027*Math.pow(Math.abs(u-.5)*2,3))
    p.push((u-.5)*slip.w,(.5-v)*slip.h,.009+curl+.002*Math.sin(u*Math.PI))
    uv.push((index%MEMO_ATLAS_GRID+.015+u*.97)/MEMO_ATLAS_GRID,1-(Math.floor(index/MEMO_ATLAS_GRID)+.015+v*.97)/MEMO_ATLAS_GRID)
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,c=a+n+1;triangles.push(a,c,a+1,a+1,c,c+1)}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(triangles);geometry.computeVertexNormals()
  const z=.139+(index%3)*.002
  b.add('paint',geometry,'#ffffff',[slip.x,slip.y,z],[1,1,1],[0,0,slip.a])
  if(detailed) {
    const pinY=slip.h*.423,pinX=slip.x-pinY*Math.sin(slip.a),py=slip.y+pinY*Math.cos(slip.a)
    b.cylinder('gold','#96764c',[pinX,py,.162],.0038,.0038,.016,[.13,0,.10],6)
    b.ball('gold','#c5a370',[pinX,py+.006,.165],[.005,.0055,.003])
  }
}
function headerShape(scale=1) {
  const s=new Shape();s.moveTo(-.347*scale,-.062*scale);s.lineTo(.347*scale,-.062*scale)
  s.lineTo(.347*scale,.052*scale);s.lineTo(.31*scale,.077*scale);s.quadraticCurveTo(.10*scale,.096*scale,0,.109*scale)
  s.quadraticCurveTo(-.10*scale,.096*scale,-.31*scale,.077*scale);s.lineTo(-.347*scale,.052*scale);s.closePath();return s
}
function build(detailed:boolean) {
  const b=new PropBuilder([6,3],`observatory-notes-hanok-v4-${detailed}`)
  // A broader, lower board, still wholly inside the existing summit collider.
  for(const side of [-1,1]) {
    const x=side*.475
    carvedBox(b,'wood','#63482f',[x,.68,0],[.095,1.36,.14],.008)
    carvedBox(b,'wood','#87643d',[x,.0225,0],[.16,.045,.19],.005)
    carvedBox(b,'wood','#765635',[side*.351,.416,-.075],[.062,.43,.070],.005,[0,0,side*.58])
  }
  carvedBox(b,'wood','#684b32',[0,1.006,0],[1.075,.806,.168],.010)
  // A warm fabric/wood backing separates ivory letters from the frame.
  carvedBox(b,'stone','#b3a080',[0,1.004,.125],[.979,.681,.016],.004)
  for(const side of [-1,1]) {
    carvedBox(b,'wood','#83623f',[side*.511,1.009,.127],[.061,.816,.07],.006)
    carvedBox(b,'wood','#a18555',[side*.473,1.002,.153],[.011,.688,.012],.001)
    if(detailed)for(const y of [.67,1.32])b.cylinder('wood','#58442f',[side*.509,y,.167],.006,.006,.004,[Math.PI/2,0,0],8)
  }
  for(const y of [.604,1.403])carvedBox(b,'wood','#795736',[0,y,.126],[1.122,.064,.201],.007)
  carvedBox(b,'wood','#a17e4e',[0,.644,.171],[1.097,.015,.045],.002)
  carvedBox(b,'wood','#58402d',[0,1.444,-.005],[1.16,.059,.455],.007)
  b.add('wood',new ExtrudeGeometry(headerShape(),{depth:.024,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,curveSegments:6}),'#705135',[0,1.323,.203])
  b.add('wood',new ExtrudeGeometry(headerShape(.954),{depth:.008,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:6}),'#c4a16c',[0,1.323,.233])
  for(const x of [-.314,.314])b.cylinder('gold','#a58b58',[x,1.327,.246],.0045,.0045,.005,[Math.PI/2,0,0],8)
  memoRoof(b,detailed)
  const selected=detailed?memoSlips.map((_,i)=>i):[0,2,4,6,9,11]
  for(const i of selected)paper(b,i,detailed)
  for(const side of [-1,1])lantern(b,side,detailed)
  if(detailed) {
    foliage(b)
    b.add('wood',new ExtrudeGeometry(invitationShape(),{depth:.019,bevelEnabled:true,bevelThickness:.005,bevelSize:.005,bevelSegments:1,curveSegments:12}),'#5f4831',[-.493,.540,.276])
    const rim:XYZ[]=Array.from({length:25},(_,i)=>{const a=i*Math.PI/12;return[-.493+Math.cos(a)*.118,.551+Math.sin(a)*.106,.302]})
    fineCurve(b,'wood','#a78b5c',rim,.0035,24)
    fineCurve(b,'wood','#8b7551',[[-.502,.666,.14],[-.493,.679,.23],[-.490,.650,.287]],.004,7)
    pigeon(b)
  }
  return b.finish()
}
export const notesBoardArt={near:build(true),far:build(false)}
export function notesBoardTitle(c:CanvasRenderingContext2D,w:number,h:number) {
  c.clearRect(0,0,w,h);c.fillStyle='#493622';c.textAlign='center';c.textBaseline='middle'
  c.font=`500 ${h*.52}px "BusanDandiMyeongjo","Batang",serif`;c.fillText('온탑 메모함',w/2,h*.56,w*.94)
  c.strokeStyle='#785a3380';c.lineWidth=3;c.beginPath();c.moveTo(w*.10,h*.84);c.lineTo(w*.90,h*.84);c.stroke()
}
export function notesInvitation(c:CanvasRenderingContext2D,w:number,h:number) {
  c.clearRect(0,0,w,h);c.fillStyle='#eddfbd';c.textAlign='center';c.textBaseline='middle';c.font=`500 ${h*.20}px "BusanDandiMyeongjo","Batang",serif`
  for(const [i,line]of ['여기에','마음 한 장','남겨보세요'].entries())c.fillText(line,w/2,h*(.21+i*.255),w*.91)
  c.strokeStyle='#c1c59a';c.lineWidth=h*.012;c.beginPath();c.moveTo(w*.50,h*.96);c.quadraticCurveTo(w*.51,h*.84,w*.61,h*.83);c.stroke()
}
function pigeon(b:PropBuilder) {
  softBall(b,'stone','#8b9093',[.20,1.653,.015],[.048,.035,.045])
  softBall(b,'stone','#65717d',[.205,1.654,.047],[.037,.023,.013])
  softBall(b,'stone','#758689',[.229,1.684,.012],[.019,.028,.02])
  softBall(b,'stone','#778490',[.234,1.702,.015],[.018,.017,.018])
  b.cylinder('gold','#c18a4b',[.257,1.698,.02],0,.007,.021,[0,0,Math.PI/2],6)
  softBall(b,'stone','#262729',[.24,1.707,.03],[.003,.003,.002])
  fineCurve(b,'stone','#c6c4b6',[[.21,1.671,.054],[.196,1.659,.061],[.176,1.650,.055]],.003,5)
  carvedBox(b,'stone','#4e5964',[.159,1.645,.012],[.055,.012,.034],.002,[0,.15,.12])
  for(const x of [.19,.213])fineCurve(b,'gold','#ae7851',[[x,1.63,.03],[x,1.615,.032],[x+.011,1.615,.039]],.002,3)
}
