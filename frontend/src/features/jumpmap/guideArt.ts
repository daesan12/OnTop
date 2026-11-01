import { RingGeometry, Shape, ShapeGeometry } from 'three'
import { PropBuilder } from '../../world/art/propGeometry'

const b = new PropBuilder()
// 기존 출발 표식과 같은 2.8 × 2.2m, 높이 0.1m. 문양만 바꾸고 충돌·코스는 유지한다.
b.box('stone','#9c9c8e',[0,-.09,0],[2.8,.02,2.2])
b.box('stone','#d2cbb8',[0,-.04,0],[2.72,.08,2.12])
b.add('gold',new RingGeometry(.86,.91,8),'#bda36a',[0,.012,0],[1,1,1],[-Math.PI/2,0,0])
function roof(width:number,z:number) {
  const points=[[-width,z],[0,z-.19],[width,z],[width*.83,z+.065],[-width*.83,z+.065]]
  const shape=new Shape()
  points.forEach(([x,y],i)=>i?shape.lineTo(x!,-y!):shape.moveTo(x!,-y!))
  shape.closePath()
  b.add('stone',new ShapeGeometry(shape),'#526251',[0,.024,0],[1,1,1],[-Math.PI/2,0,0])
}
b.box('stone','#526251',[0,.02,-.59],[.045,.012,.21])
roof(.32,-.37); roof(.49,-.04); roof(.65,.31)
b.box('stone','#64715d',[0,.018,-.20],[.17,.012,.25])
b.box('stone','#64715d',[0,.018,.16],[.25,.012,.28])
b.box('stone','#526251',[0,.02,.47],[.9,.012,.12])
b.box('stone','#526251',[0,.02,.59],[1.16,.012,.1])
export const jumpmapGuideArt = b.finish()
