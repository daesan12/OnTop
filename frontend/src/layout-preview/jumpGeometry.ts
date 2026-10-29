import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { BoxGeometry,LatheGeometry,Vector2,ExtrudeGeometry,Path,RingGeometry,Shape,SphereGeometry } from 'three'
import { PropBuilder,type PropFinish } from '../world/art/propGeometry'
import type { JumpTheme } from './jumpCourse'
import { JUMP_START,JUMP_FINISH } from './jumpCourse'

function slab(b:PropBuilder,kind:PropFinish,color:string,w:number,d:number,h:number,y=0) {
  if(SIMPLE_MAP){b.box(kind,color,[0,y-h/2,0],[w,h,d]);return}
  const shape=new Shape(),r=.12
  shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2)
  const g=new ExtrudeGeometry(shape,{depth:Math.max(.01,h-.06),bevelEnabled:true,bevelSize:.03,bevelThickness:.03,bevelSegments:4,curveSegments:12});g.rotateX(-Math.PI/2)
  if(kind==='stone'){
    const p=g.getAttribute('position')
    for(let i=0;i<p.count;i++){
      const px=p.getX(i),pz=p.getZ(i),edge=Math.max(Math.abs(px)/(w/2),Math.abs(pz)/(d/2))
      if(edge>.88){const inset=.007+.009*(.5+.5*Math.sin(px*31+pz*23));p.setX(i,px*(1-inset));p.setZ(i,pz*(1-inset))}
    }
    g.computeVertexNormals()
  }
  b.add(kind,g,color,[0,y-h+.03,0])
}
function coinGeometry(size=2,depth=.2) {
  const s=new Shape();s.absarc(0,0,size,0,Math.PI*2,false)
  const h=new Path(),hole=size*.46;h.moveTo(-hole,-hole);h.lineTo(-hole,hole);h.lineTo(hole,hole);h.lineTo(hole,-hole);h.closePath();s.holes.push(h)
  return new ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:SIMPLE_MAP?1:2,curveSegments:SIMPLE_MAP?8:48})
}
function themeModel(theme:JumpTheme) {
  const b=new PropBuilder([16,10])
  if(theme==='stone') {
    slab(b,'stone','#ccc6b7',1.8,1.8,.24)
    b.cylinder('stone','#cfc9bd',[0,-.29,0],1.3,1,.12,[0,Math.PI/4,0],4)
    slab(b,'stone','#a49e92',1.15,1.15,.12,-.35)
  } else if(theme==='gomoku') {
    b.add('stone',new LatheGeometry([[0,0],[.5,0],[.73,.04],[.84,.16],[.85,.27],[.81,.4],[.7,.5],[0,.5]].map(p=>new Vector2(p[0],p[1])),SIMPLE_MAP?12:64),'#e9e5d9',[0,-.5,0])
  } else if(theme==='fish') {
    b.ball('paint','#c99343',[0,-.3,0],[1,.3,.62])
    slab(b,'paint','#dfa854',1.4,.82,.13)
    const tail=new Shape();tail.moveTo(-.8,-.18);tail.lineTo(-1.5,-.5);tail.quadraticCurveTo(-1.35,0,-1.5,.5);tail.lineTo(-.8,.18);tail.closePath()
    const tg=new ExtrudeGeometry(tail,{depth:.3,bevelEnabled:true,bevelSize:.06,bevelThickness:.05,bevelSegments:2});tg.rotateX(-Math.PI/2);b.add('paint',tg,'#b97d32',[0,-.45,0])
    for(const side of [-1,1]) {
      b.ball('paint','#684023',[.62,-.04,side*.2],[.065,.035,.065])
      b.curve('paint','#a4672e',[[.38,-.015,side*.44],[.52,-.01,side*.3],[.48,-.01,side*.12]],.022,8)
      for(let i=0;i<5;i++)b.curve('paint','#aa7134',[[-.55+i*.2,-.012,side*.1],[-.47+i*.2,-.008,side*.23],[-.55+i*.2,-.014,side*.37]],.013,6)
    }
    // Pressed pastry scales, toasted rim and mould seam are real shallow relief.
    for(let row=-2;row<=2;row++)for(let col=-2;col<=1;col++){
      const px=col*.22, pz=row*.15
      b.curve('paint',(row+col)%2?'#a36b2f':'#bd853d',[[px-.08,-.012,pz-.06],[px,-.004,pz+.055],[px+.08,-.012,pz-.06]],.009,8)
    }
    b.ball('paint','#e4ae5c',[.94,-.18,0],[.13,.1,.24])
    b.box('paint','#5b1f1a',[0,-.24,0],[1.6,.035,.06])
  } else if(theme==='cloud') {
    for(const [x,y,z,r] of [[0,-.45,0,.85],[-.65,-.45,.1,.6],[.65,-.43,-.08,.6],[.1,-.34,-.6,.57],[-.1,-.4,.6,.58],[.38,-.27,.3,.52]]) {
      const g=new SphereGeometry(1,SIMPLE_MAP?6:18,SIMPLE_MAP?4:12);g.scale(r!,r!*.85,r!);g.translate(x!,y!,z!);const p=g.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,Math.min(0,p.getY(i)));g.computeVertexNormals();b.add('paint',g,'#edf0eb')
    }
  } else if(theme==='lantern') {
    b.cylinder('paint','#cf3a2f',[0,-.43,0],.56,.6,.48,[0,0,0],24)
    b.cylinder('paint','#2d4fa0',[0,-.89,0],.6,.52,.44,[0,0,0],24)
    b.cylinder('wood','#4a2f20',[0,-.08,0],.72,.72,.16,[0,0,0],24)
    b.cylinder('wood','#4a2f20',[0,-1.16,0],.63,.63,.12,[0,0,0],24)
    for(let i=0;i<12;i++){const a=i*Math.PI/6;b.box('wood','#3a1d14',[Math.cos(a)*.575,-.67,Math.sin(a)*.575],[.025,.94,.025])}
    b.cylinder('gold','#a8803b',[0,-1.28,0],.08,.1,.18)
    for(let i=0;i<6;i++)b.curve('paint','#bd3330',[[0,-1.3,0],[Math.sin(i)*.09,-1.5,Math.cos(i)*.09],[Math.sin(i)*.08,-1.62,Math.cos(i)*.08]],.012,6)
    for(let i=0;i<24;i++){
      const a=i*Math.PI/12
      b.curve('paint',i%2?'#9e342b':'#bf4737',[[Math.cos(a)*.57,-.2,Math.sin(a)*.57],[Math.cos(a)*.605,-.53,Math.sin(a)*.605],[Math.cos(a)*.55,-.91,Math.sin(a)*.55]],.007,10)
    }
    b.cylinder('glow','#ffdb97',[0,-.02,0],.62,.62,.025,[0,0,0],24)
  } else if(theme==='kite') {
    slab(b,'paint','#e5dfcc',1.6,1.9,.05)
    for(let i=0;i<17;i++)b.curve('paint',i%3?'#d3ccb9':'#c6beaa',[[-.76,.008,-.82+i*.1],[-.2,.009,-.81+i*.1],[.25,.008,-.83+i*.1],[.76,.009,-.82+i*.1]],.0018,8)
    b.box('paint','#c8372d',[0,.008,-.77],[1.5,.018,.22])
    b.cylinder('paint','#2a4fa0',[0,.018,0],.32,.32,.018,[0,0,0],32)
    b.box('wood','#b08a4e',[0,-.08,0],[.035,.045,1.84])
    for(const side of [-1,1])b.box('wood','#b08a4e',[0,-.075,0],[2.15,.035,.035],[0,side*.87,0])
    for(const side of [-1,1])b.curve('paint','#b8523a',[[side*.45,-.03,.9],[side*.47,-.2,1.2],[side*.56,-.5,1.45],[side*.42,-.72,1.65]],.025,16)
  } else if(theme==='lily') {
    const s=new Shape();s.moveTo(0,0);s.absarc(0,0,1,.18,Math.PI*2-.18,false);s.lineTo(0,0)
    const g=new ExtrudeGeometry(s,{depth:.1,bevelEnabled:false,curveSegments:SIMPLE_MAP?8:40});g.rotateX(-Math.PI/2);b.add('paint',g,'#5e8c57',[0,-.1,0])
    for(let i=1;i<9;i++){const a=i*Math.PI/5;b.curve('paint','#426943',[[0,.012,0],[Math.cos(a)*.45,.015,Math.sin(a)*.45],[Math.cos(a)*.9,.012,Math.sin(a)*.9]],.012,8)}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;b.ball('paint','#ef93ad',[.43+Math.cos(a)*.15,.1,.35+Math.sin(a)*.15],[.09,.12,.09])}
    b.ball('gold','#f2d15c',[.43,.15,.35],[.08,.06,.08])
  } else {
    b.cylinder('stone','#7a766f',[0,-.225,0],1.3,1.3,.45,[0,0,0],48)
    b.add('gold',new RingGeometry(1.16,1.28,64),'#d8a640',[0,.012,0],[1,1,1],[-Math.PI/2,0,0])
    b.add('gold',coinGeometry(),'#dba944',[0,.95,-.1])
    for(const side of [-1,1])b.box('gold','#c8963e',[side*.5,.018,0],[.045,.02,1.04])
    for(const side of [-1,1])b.box('gold','#c8963e',[0,.018,side*.5],[1.04,.02,.045])
  }
  return b.finish()
}
export const jumpArt=Object.fromEntries(['stone','gomoku','fish','cloud','lantern','kite','lily','gate'].map(t=>[t,themeModel(t as JumpTheme)])) as Record<JumpTheme,ReturnType<PropBuilder['finish']>>
const start=new PropBuilder();slab(start,'stone','#c7bfac',2.8,2.2,.1)
start.add('gold',new RingGeometry(.74,.92,64),'#cfad56',[0,.012,0],[1,1,1],[-Math.PI/2,0,0])
for(const side of [-1,1]){start.box('gold','#c99d43',[side*.22,.018,0],[.03,.02,.47]);start.box('gold','#c99d43',[0,.018,side*.22],[.47,.02,.03])}
export const jumpStartArt=start.finish()
const finish=new PropBuilder();finish.add('gold',coinGeometry(2.6,.08),'#dba944',[JUMP_FINISH.x,JUMP_FINISH.y,JUMP_FINISH.z],[1,1,1],[-Math.PI/2,0,0])
export const jumpFinishArt=finish.finish()
export const jumpParticleGeometry=new BoxGeometry(.055,.055,.055)
export { JUMP_START }
