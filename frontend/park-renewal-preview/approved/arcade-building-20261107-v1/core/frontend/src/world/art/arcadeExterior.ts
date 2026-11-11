import {CatmullRomCurve3,CylinderGeometry,ExtrudeGeometry,Shape,TubeGeometry,Vector3} from 'three'
import {type PropBuilder,type XYZ} from '../../../../../../../../src/world/art/propGeometry.ts'
import {addArcadeTileRoof} from './arcadeRoofGeometry'
import {addArcadeTower,drawArcadeTower} from './arcadeTowerEmblem'

const wood='#98643c',darkWood='#75492f',gold='#d6a85e',cream='#f5e6ca',rose='#b95763'
type Envelope={width:number;depth:number;height:number;doorWidth:number}
export const ARCADE_MARQUEE={width:8.8,height:1.7,heightOffset:.35,frontOffset:1.3} as const
function line(b:PropBuilder,p:XYZ[],radius:number){b.add('wood',new TubeGeometry(new CatmullRomCurve3(p.map(v=>new Vector3(...v))),20,radius,8,false),darkWood)}
function board(b:PropBuilder,w:number,h:number,z:number,y:number,color:string){
 const s=new Shape(),r=.22;s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2)
 b.add('wood',new ExtrudeGeometry(s,{depth:.25,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:3,curveSegments:12}),color,[0,y,z])
}
function lantern(b:PropBuilder,x:number,z:number){
 const y=3.9
 b.box('glow','#ffd184',[x,y,z],[.9,1.14,.73])
 for(const dx of [-.5,.5])for(const dz of [-.42,.42])b.box('wood',wood,[x+dx,y,z+dz],[.115,1.35,.115])
 for(const dy of [-.65,.65])b.box('wood',wood,[x,y+dy,z],[1.17,.16,1.03])
 b.box('wood','#af7c45',[x,y+.76,z],[1.35,.16,1.16]);b.box('wood',wood,[x,y-.79,z],[1.23,.16,1.06])
 b.add('wood',new CylinderGeometry(.105,.105,.28,20),darkWood,[x,y+.93,z])
 line(b,[[x,y+1.03,z],[x,y+1.4,z],[x,y+1.45,z-.78]],.055)
 b.box('wood',wood,[x,y+1.45,z-.78],[.24,.28,.22])
 addArcadeTower(b,'#b76635',x,y,z+.435,.67)
}

/** Traditional wall skins stay outside the two machines and the reserved floor. */
export function addArcadeExterior(body:PropBuilder,roof:PropBuilder,walls:PropBuilder,f:Envelope){
 const {width:w,depth:d,height:h,doorWidth:door}=f,front=d/2+.2
 addArcadeTileRoof(roof,f)
 for(const side of [-1,1]){
  for(const x of [side*(w/2-.12),side*(door/2+.38),side*6])walls.box('wood',wood,[x,h/2,front],[.35,h,.34])
  for(const y of [1.1,5.55,h-.15])walls.box('wood',wood,[side*(door/2+(w-door)/4),y,front],[(w-door)/2,.18,.28])
  for(const z of [-d/2,-3,0,3,d/2])walls.box('wood',wood,[side*(w/2+.19),h/2,z],[.3,h,.3])
  for(const y of [1.12,5.4])walls.box('wood',wood,[side*(w/2+.2),y,0],[.28,.18,d])
  // One glowing lattice window on each side wall, with deep wood casing.
  const x=side*(w/2+.32),z=-.8
  walls.box('wood',wood,[x,3.1,z],[.26,2.8,4.1])
  walls.box('glow','#edc98a',[x+side*.15,3.1,z],[.045,2.43,3.72])
  for(const dz of [-1.45,-.72,0,.72,1.45])walls.box('wood',darkWood,[x+side*.2,3.1,z+dz],[.08,2.5,.08])
  for(const dy of [-.78,0,.78])walls.box('wood',darkWood,[x+side*.2,3.1+dy,z],[.08,.08,3.8])
  const plaque=side*(door/2+(w-door)/4)
  walls.box('wood',wood,[plaque,3.15,front+.2],[2.15,2.25,.18])
  walls.box('paint','#744d3b',[plaque,3.15,front+.31],[1.95,2.05,.05])
  addArcadeTower(walls,'#d8989f',plaque,3.15,front+.37,1.33)
  lantern(walls,side*(door/2+1.05),front+.7)
  // Low stone blocks hug the wall and leave the entrance fully open.
  for(let z=-d/2+.65;z<d/2;z+=1.3)walls.box('stone',Math.round(z)%2?'#aba69a':'#c1b7a7',[side*(w/2+.18),.43,z],[.4,.68,1.22])
 }
 for(let x=-w/2+.65;x<w/2;x+=1.3)if(Math.abs(x)>door/2+.65)walls.box('stone',Math.round(x)%2?'#c1b7a7':'#aaa89e',[x,.43,front+.14],[1.22,.68,.4])
 walls.box('wood',wood,[0,h-.12,-d/2-.2],[w,.25,.28])
 body.box('wood',wood,[0,5.2,front+.12],[door+1.1,.28,.36])
 roof.add('wood',new CylinderGeometry(.075,.075,door+1.1,24),darkWood,[0,5.13,front+.31],[1,1,1],[0,0,Math.PI/2])
 for(let i=0;i<5;i++){
  const width=(door+.8)/5-.035,s=new Shape();s.moveTo(-width/2,0);s.lineTo(width/2,0);s.lineTo(width/2,-.79);s.quadraticCurveTo(width/2,-.9,width/2-.12,-.9);s.lineTo(-width/2+.12,-.9);s.quadraticCurveTo(-width/2,-.9,-width/2,-.79);s.closePath()
  roof.add('paint',new ExtrudeGeometry(s,{depth:.05,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,curveSegments:10}),i%2?rose:'#a94e5a',[(i-2)*(door+.8)/5,5.1,front+.3])
 }
 addArcadeTower(roof,cream,0,4.66,front+.39,.61)
 const signY=h+ARCADE_MARQUEE.heightOffset,signZ=d/2+.9
 board(roof,9.55,2.18,signZ-.12,signY,gold);board(roof,9.12,1.88,signZ+.03,signY,darkWood)
 for(const x of [-3.7,3.7])roof.box('wood',wood,[x,h+.05,signZ-.15],[.24,1.7,.28])
}
export function drawArcadeMarquee(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#8f5734';c.fillRect(0,0,w,h)
 c.strokeStyle='#aa6c3e';c.lineWidth=2;for(let i=1;i<7;i++){c.beginPath();c.moveTo(0,h*i/7);c.bezierCurveTo(w*.3,h*(i+.2)/7,w*.7,h*(i-.2)/7,w,h*i/7);c.stroke()}
 c.strokeStyle='#d9aa67';c.lineWidth=5;c.strokeRect(5,5,w-10,h-10)
 drawArcadeTower(c,w*.115,h*.55,h*.72,'#efb0bc')
 c.fillStyle=cream;c.textAlign='center';c.textBaseline='middle';c.font='800 '+h*.49+'px "Malgun Gothic",sans-serif';c.fillText('온탑 오락실',w*.59,h*.45,w*.75)
 c.fillStyle='#e7c492';c.font='700 '+h*.14+'px sans-serif';c.fillText('ON TOP  ·  GAME CENTER',w*.59,h*.84,w*.75)
}
export function drawArcadeSide(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle=darkWood;c.fillRect(0,0,w,h);c.strokeStyle=gold;c.lineWidth=5;c.strokeRect(4,4,w-8,h-8)
 drawArcadeTower(c,w*.15,h*.55,h*.72,'#efb0bc');c.fillStyle=cream;c.textAlign='center';c.textBaseline='middle';c.font='800 '+h*.5+'px "Malgun Gothic",sans-serif';c.fillText('오락실',w*.6,h*.5,w*.63)
}
