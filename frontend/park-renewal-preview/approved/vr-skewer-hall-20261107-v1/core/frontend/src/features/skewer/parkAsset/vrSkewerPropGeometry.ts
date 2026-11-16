import {CatmullRomCurve3,CylinderGeometry,ExtrudeGeometry,LatheGeometry,Shape,TorusGeometry,TubeGeometry,Vector2,Vector3} from 'three'
import {type PropBuilder,type XYZ} from '../../../../../../../../../src/world/art/propGeometry.ts'
import {addSkewerDisplay,roundFood,softBox,tube} from './skewerDisplayGeometry'

/** A hinged front/rear frame, not a flat board balanced on two posts. */
export function addSkewerAFrame(b:PropBuilder,compact=false){
 const x=4.35,tilt=-.28,cy=1.47,cz=5.7,wood='#a16c42'
 const on=(dx:number,dy:number,dz:number):XYZ=>[x+dx,cy+dy*Math.cos(tilt)-dz*Math.sin(tilt),cz+dy*Math.sin(tilt)+dz*Math.cos(tilt)]
 softBox(b,'#694831',[x,cy,cz],[2.32,2.2,.14],.08)
 // Apply the same tilt to this board and all frame pieces as to the food display.
 const board=b.parts.paint[b.parts.paint.length-1]!;board.translate(-x,-cy,-cz);board.rotateX(tilt);board.translate(x,cy,cz)
 for(const side of [-1,1]){
  b.box('wood',wood,on(side*1.13,0,.04),[.16,2.38,.2],[tilt,0,0])
  for(const front of [-1,1]){
   const bottom=front>0?6.12:4.57,top=5.36,dy=2.51,dz=top-bottom
   b.box('wood',wood,[x+side*1.05,1.435,(top+bottom)/2],[.15,Math.hypot(dy,dz),.17],[Math.atan2(dz,dy),0,0])
  }
  b.add('metal',new CylinderGeometry(.09,.09,.24,20),'#c59b60',[x+side*1.05,2.65,5.36],[1,1,1],[0,0,Math.PI/2])
  b.box('metal','#b89463',[x+side*1.04,.86,5.34],[.055,.055,1.02])
 }
 for(const side of [-1,1])b.box('wood',wood,on(0,side*1.08,.04),[2.45,.15,.2],[tilt,0,0])
 addSkewerDisplay(b,on(-.52,0,.29),.41,Math.PI/2,true,tilt,[3,1,0],compact)
 addSkewerDisplay(b,on(.52,0,.29),.41,Math.PI/2,true,tilt,[5,4,2],compact)
}

/** Deep rounded basin, dark embers and curved overlapping flame silhouettes. */
export function addSkewerFirepit(b:PropBuilder){
 const x=-4.5,z=5.4
 const profile=[[0,.38],[.32,.38],[.64,.5],[.83,.86],[.86,.98],[.83,1.04],[.73,1.04],[.69,.92],[.55,.65],[.25,.56],[0,.56]]
 b.add('metal',new LatheGeometry(profile.map(p=>new Vector2(p[0],p[1])),48),'#655447',[x,0,z])
 b.add('metal',new TorusGeometry(.79,.052,12,64),'#9d7a56',[x,1.015,z],[1,1,1],[Math.PI/2,0,0])
 for(let i=0;i<3;i++){
  const a=i*Math.PI*2/3+.4,dx=Math.cos(a)*.44,dz=Math.sin(a)*.44
  b.box('metal','#554137',[x+dx,.3,z+dz],[.13,.5,.13],[dz*.3,0,-dx*.3])
 }
 b.cylinder('metal','#362a29',[x,.85,z],.64,.54,.08)
 for(let i=0;i<13;i++){const a=i*2.4,r=.16+(i%3)*.17;roundFood(b,i%4?'#44352f':'#923e28',[x+Math.cos(a)*r,.9+(i%2)*.045,z+Math.sin(a)*r],[.13,.075,.12])}
 for(const yaw of [-.65,.65])b.add('wood',new CylinderGeometry(.075,.1,.94,14),'#694230',[x,.94,z],[1,1,1],[0,yaw,Math.PI/2])
 // Flame, smoke and embers are animated by FirepitEffects, not opaque static cones.
}

/** Layered visor with a smooth nose bridge and a luminous inset contour. */
export function addVrGoggleEmblem(body:PropBuilder,neon:PropBuilder){
 const shape=new Shape();shape.moveTo(-.84,.3);shape.quadraticCurveTo(-1.02,.29,-1.02,.07);shape.lineTo(-.96,-.24);shape.quadraticCurveTo(-.94,-.4,-.7,-.4);shape.lineTo(-.32,-.4);shape.quadraticCurveTo(-.2,-.4,-.12,-.22);shape.quadraticCurveTo(0,-.08,.12,-.22);shape.quadraticCurveTo(.2,-.4,.32,-.4);shape.lineTo(.7,-.4);shape.quadraticCurveTo(.94,-.4,.96,-.24);shape.lineTo(1.02,.07);shape.quadraticCurveTo(1.02,.29,.84,.3);shape.quadraticCurveTo(0,.49,-.84,.3);shape.closePath()
 softBox(body,'#3a3149',[0,5.35,4.98],[2.3,1.05,.26],.3)
 body.add('paint',new ExtrudeGeometry(shape,{depth:.15,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:4,curveSegments:24}),'#656a9c',[0,5.35,5.12])
 body.add('paint',new ExtrudeGeometry(shape,{depth:.05,bevelEnabled:true,bevelSize:.025,bevelThickness:.015,bevelSegments:3,curveSegments:24}),'#343951',[0,5.35,5.29],[.88,.84,1])
 const points=shape.getPoints(32).map(p=>[p.x*.89,5.35+p.y*.85,5.365] as XYZ)
 const contour=new CatmullRomCurve3(points.slice(0,-1).map(p=>new Vector3(...p)),true,'centripetal')
 neon.add('paint',new TubeGeometry(contour,192,.025,10,true),'#c8a5ff')
 tube(neon,'#e9d9ff',[[-.65,5.57,5.37],[-.42,5.6,5.37],[-.23,5.6,5.37]],.014)
 for(const side of [-1,1]){
  softBox(body,'#9c91bc',[side*1.1,5.34,5.11],[.17,.46,.24],.075)
  tube(neon,'#a9b9ff',[[side*1.12,5.49,5.25],[side*1.13,5.34,5.25],[side*1.1,5.19,5.25]],.02)
 }
}
