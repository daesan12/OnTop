import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {addGachaRoof} from './gachaRoof.ts'
import { PropBuilder, type XYZ } from '../../../../../src/world/art/propGeometry.ts'

const gold='#eac366',wood='#985e37'
export const GACHA_ASSET={width:3.6,depth:3.9,height:5.98} as const
function tube(b:PropBuilder,kind:'gold'|'wood'|'tile',color:string,points:XYZ[],radius:number){
 b.add(kind,new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),points.length===2?1:16,radius,8,false),color)
}
function flower(b:PropBuilder,x:number,y:number,z:number,r:number){
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;b.add('gold',new SphereGeometry(1,16,12),gold,[x+Math.sin(a)*r*.48,y+Math.cos(a)*r*.48,z],[r*.33,r*.35,.065],[0,0,-a])}
 b.add('gold',new SphereGeometry(1,16,12),'#fff0bb',[x,y,z+.05],[r*.21,r*.21,.07])
}
export function buildGachaMachine(){
 let b=new PropBuilder()
 b.add('wood',new CylinderGeometry(1.13,1.26,.16,12),'#43382d',[0,.12,0])
 b.add('gold',new CylinderGeometry(1.12,1.2,.12,32),gold,[0,.23,0])
 // An actual open arch, rather than a dark rectangle pasted onto an intact barrel.
 b.add('wood',new CylinderGeometry(.98,1.12,1.5,32,1,true,.66,Math.PI*2-1.32),wood,[0,1.01,0])
 const front=new Shape();front.moveTo(-.72,.27);front.lineTo(-.4,.27);front.lineTo(-.4,.74);front.absarc(0,.74,.4,Math.PI,0,true);front.lineTo(.4,.27);front.lineTo(.72,.27);front.lineTo(.61,1.76);front.lineTo(-.61,1.76);front.closePath()
 b.add('wood',new ExtrudeGeometry(front,{depth:.12,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:16}), '#ab7047',[0,0,.87])
 b.box('wood','#211f18',[0,.64,.5],[.91,.9,.08]);b.box('wood','#3e2e20',[0,.29,.73],[.85,.09,.6])
 const arch:XYZ[]=[[-.43,.28,1.035],[-.43,.74,1.035],...Array.from({length:21},(_,i):XYZ=>{const a=Math.PI-i*Math.PI/20;return [Math.cos(a)*.43,.74+Math.sin(a)*.43,1.035]}),[.43,.28,1.035]]
 tube(b,'gold',gold,arch,.062)
 b.add('paint',new RoundedBoxGeometry(.76,.115,.66,3,.045),'#b72d38',[0,.41,1.06]);b.box('gold',gold,[0,.34,1.37],[.87,.12,.06])
 for(const x of [-.43,.43])tube(b,'gold',gold,[[x,.27,.94],[x,.34,1.12],[x,.50,1.35]],.052)
 for(const y of [.31,1.7]){
  b.add('gold',new CylinderGeometry(y>1?1.08:1.16,y>1?1.08:1.16,.14,32),gold,[0,y,0])
  for(let i=0;i<20;i++){const a=i*Math.PI/10;b.ball('gold','#ffe4a1',[Math.sin(a)*(y>1?1.085:1.165),y,Math.cos(a)*(y>1?1.085:1.165)],[.026,.026,.026])}
 }
 // Plank seams stop before the outlet. Curved outer hoops remain continuous.
 for(let i=0;i<17;i++){const a=.7+i*(Math.PI*2-1.4)/16;tube(b,'wood','#80502f',[[Math.sin(a)*1.105,.4,Math.cos(a)*1.105],[Math.sin(a)*.985,1.6,Math.cos(a)*.985]],.012)}
 b.add('gold',new CylinderGeometry(.265,.265,.09,32),gold,[0,1.43,1.045],[1,1,1],[Math.PI/2,0,0])
 b.add('gold',new CylinderGeometry(.215,.215,.1,32),'#e4b15b',[0,1.43,1.1],[1,1,1],[Math.PI/2,0,0])
 b.ring('gold','#ffdb86',[0,1.43,1.16],.228,.012)
 for(let i=0;i<10;i++){const a=i*Math.PI/5;b.add('gold',new SphereGeometry(.014,8,6),'#ffe6a0',[Math.sin(a)*.25,1.43+Math.cos(a)*.25,1.105])}
 for(const side of [-1,1]){
  const cloud=new Shape();cloud.moveTo(-.17,0);cloud.bezierCurveTo(-.2,.04,-.13,.075,-.09,.06);cloud.bezierCurveTo(-.11,.15,.02,.18,.035,.08);cloud.bezierCurveTo(.08,.14,.16,.09,.13,.04);cloud.bezierCurveTo(.23,.06,.22,0,.14,0);cloud.closePath()
  b.add('gold',new ExtrudeGeometry(cloud,{depth:.035,bevelEnabled:true,bevelSize:.012,bevelThickness:.01,bevelSegments:2,curveSegments:20}),'#f0c467',[side*.49,.98,1.005],[.85,.85,1])
 }

 // Close the panel-to-barrel returns before enlarging the timber body.
 for(const side of [-1,1]){
  const g=new BufferGeometry(),p:number[]=[]
  for(const [y,r,x]of [[.27,1.12,.72],[1.76,.98,.61]])p.push(side*x!,y!,.99,side*Math.sin(.66)*r!,y!,Math.cos(.66)*r!)
  g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(side>0?[0,2,1,1,2,3]:[0,1,2,1,3,2]);g.computeVertexNormals();b.add('wood',g,wood)
 }
 const core=b.finish();for(const g of Object.values(core))g.scale(1.32,1.12,1.32)
 b=new PropBuilder()
 for(const y of [2.06,4.42]){
  b.add('gold',new CylinderGeometry(1.35,1.35,.12,48),gold,[0,y,0])
  for(let i=0;i<24;i++){const a=i*Math.PI/12;b.add('gold',new SphereGeometry(.026,8,6),'#ffe0a2',[Math.sin(a)*1.36,y,Math.cos(a)*1.36])}
 }
 for(const [x,y,z]of GACHA_POSTS){
  b.add('wood',new CylinderGeometry(.05,.05,2.46,12),wood,[x,y,z])
  b.add('gold',new SphereGeometry(.08,12,8),gold,[x,4.46,z])
  tube(b,'gold',gold,[[x*.7,2.06,z*.7],[x,2.06,z],[x,2.17,z]],.045)
 }
 addGachaRoof(b)
 b.add('gold',new CylinderGeometry(.36,.36,.11,32),gold,[0,4.54,1.84],[1,1,1],[Math.PI/2,0,0])
 b.add('gold',new CylinderGeometry(.31,.31,.12,32),'#cd922f',[0,4.54,1.87],[1,1,1],[Math.PI/2,0,0]);flower(b,0,4.54,1.95,.36)
 for(const x of [-1.94,1.94]){
  tube(b,'gold',gold,[[x,4.61,1.10],[x,4.43,1.10]],.02)
  for(let i=0;i<3;i++)b.ring('gold',gold,[x,4.36-i*.1,1.10],.052,.012,[0,i%2*Math.PI/2,0])
  b.add('gold',new SphereGeometry(.055,12,8),gold,[x,4.05,1.1])
  b.box('glow','#ffe4a0',[x,3.7,1.1],[.32,.57,.32])
  for(const y of [3.39,4.01]){b.add('wood',new RoundedBoxGeometry(.46,.065,.46,2,.018),'#9d642c',[x,y,1.1]);b.box('gold',gold,[x,y+.035,1.1],[.44,.025,.44])}
  b.add('gold',new RoundedBoxGeometry(.38,.08,.38,2,.025),gold,[x,4.065,1.1])
  for(const dx of [-.175,.175])for(const dz of [-.175,.175])b.box('wood','#a77237',[x+dx,3.7,1.1+dz],[.035,.57,.035])
  flower(b,x,3.7,1.271,.095)
  tube(b,'gold',gold,[[x,3.35,1.1],[x,3.23,1.1]],.02);b.add('gold',new SphereGeometry(.052,12,8),gold,[x,3.23,1.1])
  b.add('paint',new CylinderGeometry(.022,.09,.29,12),'#226748',[x,3.04,1.1])
 }
 const head=b.finish(),result:ReturnType<PropBuilder['finish']>={}
 for(const kind of new Set([...Object.keys(core),...Object.keys(head)])){
  const key=kind as keyof typeof head,parts=[core[key],head[key]].filter((g):g is BufferGeometry=>!!g)
  result[key]=parts.length===1?parts[0]:mergeGeometries(parts)!
  if(parts.length>1)for(const g of parts)g.dispose()
 }
 // Keep the original lever shape/colours at the end of the same gold batch.
 // Its small contiguous vertex range can move independently without another draw call.
 const leverBuilder=new PropBuilder()
 tube(leverBuilder,'gold',gold,[[0,1.43,1.18],[.075,1.54,1.2],[.16,1.64,1.22]],.045)
 leverBuilder.add('gold',new SphereGeometry(1,16,12),'#f8da88',[.16,1.64,1.24],[.095,.095,.095])
 const lever=leverBuilder.finish().gold!;lever.scale(1.32,1.12,1.32)
 const oldGold=result.gold!,start=oldGold.getAttribute('position').count,count=lever.getAttribute('position').count
 result.gold=mergeGeometries([oldGold,lever])!;result.gold.userData.leverRange={start,count};result.gold.userData.leverAngle=0
 oldGold.dispose();lever.dispose()
 return result
}
export const GACHA_POSTS:XYZ[]=[[-1.17,3.24,-1.42],[1.17,3.24,-1.42]]
// Pre-settled static pile: radius .315, floor at 2.12, contact spacing about .637.
// The lower capsules touch the gold floor; every raised capsule rests on a lower one.
export const PARK_CAPSULES:XYZ[]=[[0.28409,2.435,0.24686],[-0.76664,2.435,0.57826],[0.09357,2.43493,-0.36082],[0.3985,2.435,0.87349],[-0.95961,2.435,-0.02911],[0.88858,2.43499,-0.36339],[-0.23594,2.435,0.93059],[-0.15441,2.435,-0.94757],[0.9205,2.435,0.27278],[-0.3375,2.435,0.10781],[0.48959,2.61521,-0.82608],[0.05518,2.90437,0.61324],[-0.71349,2.435,-0.64229],[0.63062,2.91366,-0.03158],[-0.00432,2.96312,-0.01825],[-0.00297,2.98592,-0.66567],[0.72461,2.92489,0.62972],[-0.59941,2.91597,-0.24052]]
