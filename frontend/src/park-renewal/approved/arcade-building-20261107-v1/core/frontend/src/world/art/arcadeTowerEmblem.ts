import {ExtrudeGeometry,Shape} from 'three'
import {type PropBuilder} from '../../../../../../../../world/art/propGeometry.ts'

const rectangle=(x:number,y:number,w:number,h:number)=>{
 const s=new Shape();s.moveTo(x,y);s.lineTo(x+w,y);s.lineTo(x+w,y+h);s.lineTo(x,y+h);s.closePath();return s
}
/** One silhouette shared by the signs, lanterns, curtain and wall plaques. */
const towerShapes=(()=>{
 const shapes=[rectangle(-.36,-.45,.72,.09),rectangle(-.28,-.36,.56,.09)]
 for(let i=0;i<3;i++){
  const cy=-.18+i*.24,half=.37-i*.075
  shapes.push(rectangle(-half*.57,cy-.02,half*1.14,.15))
  const s=new Shape();s.moveTo(0,cy+.29);s.quadraticCurveTo(half*.48,cy+.15,half,cy+.17);s.quadraticCurveTo(half*.85,cy+.05,0,cy+.08);s.quadraticCurveTo(-half*.85,cy+.05,-half,cy+.17);s.quadraticCurveTo(-half*.48,cy+.15,0,cy+.29);s.closePath();shapes.push(s)
 }
 shapes.push(rectangle(-.028,.55,.056,.12));const tip=new Shape();tip.absarc(0,.69,.045,0,Math.PI*2,false);shapes.push(tip)
 return shapes
})()

export function addArcadeTower(b:PropBuilder,color:string,x:number,y:number,z:number,size:number){
 b.add('paint',new ExtrudeGeometry(towerShapes,{depth:.035/size,bevelEnabled:false,curveSegments:14}),color,[x,y-.14*size,z],[size,size,size])
}
export function drawArcadeTower(c:CanvasRenderingContext2D,x:number,y:number,size:number,color:string){
 c.save();c.translate(x,y);c.scale(size,-size);c.fillStyle=color
 for(const shape of towerShapes){const points=shape.getPoints(14);c.beginPath();points.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)});c.closePath();c.fill()}
 c.restore()
}
