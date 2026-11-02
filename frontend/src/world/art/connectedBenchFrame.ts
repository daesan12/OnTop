import {BoxGeometry,Color,Float32BufferAttribute,Matrix4,Quaternion,Vector3,type BufferGeometry} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'

/** Shared closed boxes preserve the thin load-bearing pieces omitted by decorative LOD. */
export function createConnectedBenchFrame(back=true) {
  const parts:BufferGeometry[]=[],color=new Color('#283333')
  const add=(g:BufferGeometry)=>{
    const count=g.getAttribute('position').count,colors=new Float32Array(count*3)
    for(let n=0;n<count;n++)colors.set([color.r,color.g,color.b],n*3)
    g.setAttribute('color',new Float32BufferAttribute(colors,3));parts.push(g)
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>{const g=new BoxGeometry(w,h,d);g.translate(x,y,z);add(g)}
  const beam=(a:[number,number,number],b:[number,number,number],width:number)=>{
    const from=new Vector3(...a),to=new Vector3(...b),direction=to.clone().sub(from),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.clone().normalize())
    const g=new BoxGeometry(1,1,1)
    g.applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(.5),q,new Vector3(width,direction.length()+.025,width)))
    add(g)
  }
  for(const x of [-1.17,1.17]) {
    for(const z of [-.32,.32]) {
      beam([x,.035,z],[x,.48,z*.87],.10)
      box(x,.035,z,.22,.07,.19)
    }
    beam([x,.465,-.36],[x,.465,.36],.105)
    if(back) {
      beam([x,.465,-.29],[x,.76,-.36],.09)
      beam([x,.76,-.36],[x,1.31,-.39],.09)
      beam([x,.49,.29],[x,.825,.29],.08)
      beam([x,.85,-.37],[x,.825,.33],.085)
    }
  }
  for(const z of [-.24,.24])beam([-1.22,.465,z],[1.22,.465,z],.10)
  beam([-1.17,.285,-.18],[1.17,.285,-.18],.075)
  const geometry=mergeGeometries(parts,false)!
  parts.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere()
  return geometry
}
