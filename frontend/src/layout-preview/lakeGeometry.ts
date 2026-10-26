import { BufferGeometry,ExtrudeGeometry,Float32BufferAttribute,IcosahedronGeometry,Shape,ShapeGeometry } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import type { Part } from '../world/art/Instances'
import { BRIDGE_LANDINGS,landingHeight,CROSSINGS,DRAFT_LAKE,DRAFT_LAKE_ROCKS,SHORE_RUNS,crossingHeight,lakeFloorHeight,lakeRadius } from './lakeLayout'

const b=new PropBuilder([8,5])
for(const run of SHORE_RUNS) {
  const dx=run.to[0]-run.from[0],dz=run.to[1]-run.from[1],length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz)
  const x=(run.to[0]+run.from[0])/2,z=(run.to[1]+run.from[1])/2
  for(const h of [.45,1.05])b.box('wood','#7b6544',[x,h,z],[.1,.12,length+.02],[0,yaw,0])
  b.box('wood','#66553e',[run.from[0],.59,run.from[1]],[.14,1.18,.14])
  b.box('tile','#40564b',[run.from[0],1.22,run.from[1]],[.22,.09,.22])
}
export const shoreFenceArt=b.finish()

const bridges=new PropBuilder([8,6])
export const STEPPING_STONES:Array<{x:number;z:number;width:number;depth:number;height:number}>=[]
for(const c of CROSSINGS) {
  const wood=c.kind==='wood',count=Math.ceil((c.endX-c.startX)/(wood?.42:1.55)),step=(c.endX-c.startX)/count
  for(let i=0;i<count;i++) {
    const x=c.startX+(i+.5)*step,h=crossingHeight(x,c.z)!
    if(wood) {
      const slope=(crossingHeight(Math.min(c.endX,x+.05),c.z)!-crossingHeight(Math.max(c.startX,x-.05),c.z)!)/.1
      bridges.box('wood',i%4?'#aa8859':'#b49567',[x,h-.09,c.z],[step-.018,.18,c.halfWidth*2],[0,0,Math.atan(slope)])
    } else {
      const shape=new Shape(),width=(step-.09)*(1+Math.sin(i*1.7)*.035),depth=(c.halfWidth*2-.12)*(1+Math.cos(i*2.3)*.035),stoneHeight=.62
      for(let v=0;v<10;v++) {
        const angle=v*Math.PI/5,noise=1+.1*Math.sin(v*7+i*2.1),px=Math.cos(angle)*width/2*noise,pz=Math.sin(angle)*depth/2*noise
        if(v===0)shape.moveTo(px,pz);else shape.lineTo(px,pz)
      }
      shape.closePath()
      const g=new ExtrudeGeometry(shape,{depth:stoneHeight-.16,bevelEnabled:true,bevelSize:.09,bevelThickness:.08,bevelSegments:3,steps:1})
      g.rotateX(-Math.PI/2)
      bridges.add('stone',g,['#989e91','#aeb1a2','#8e998f'][i%3]!,[x,h-stoneHeight+.08,c.z+Math.sin(i*2.7)*.1])
      // Embedded mineral flecks and weathered seams sit below the bevel, never as a floating cap.
      for(let chip=0;chip<3;chip++)bridges.box('stone','#8f968b',[x+Math.sin(i+chip)*width*.25,h-.12,c.z+Math.cos(chip*2.2)*depth*.48],[.16,.055,.025],[0,chip,0])
      STEPPING_STONES.push({x,z:c.z,width,depth,height:stoneHeight})
    }
  }
  if(wood) {
    for(const side of [-1,1]) {
      const z=c.z+side*c.halfWidth,panels=Math.ceil((c.endX-c.startX)/1.6)
      const arch=Array.from({length:49},(_,i)=>{const x=c.startX+(c.endX-c.startX)*i/48;return [x,crossingHeight(x,c.z)!-.32,z] as [number,number,number]})
      bridges.curve('wood','#71573b',arch,.17,96)
      for(let i=0;i<=panels;i++) {
        const x=c.startX+(c.endX-c.startX)*i/panels,h=crossingHeight(x,c.z)!
        bridges.box('wood','#6e5538',[x,h+.55,z],[.16,1.1,.16])
        bridges.box('gold','#bba06e',[x,h+1.13,z],[.22,.08,.22])
        if(i===panels)continue
        const end=c.startX+(c.endX-c.startX)*(i+1)/panels,next=crossingHeight(end,c.z)!
        for(const y of [.4,1.03])bridges.box('wood','#96774b',[(x+end)/2,(h+next)/2+y,z],[Math.hypot(end-x,next-h),.1,.1],[0,0,Math.atan2(next-h,end-x)])
        for(const t of [.33,.67])bridges.box('wood','#8a6c46',[x+(end-x)*t,h+(next-h)*t+.7,z],[.055,.55,.055])
      }
      for(const x of [c.startX+.35,c.endX-.35])bridges.box('stone','#8c9484',[x,-.35,z],[.65,1,.65])
    }
  }
}
for(const p of BRIDGE_LANDINGS) {
  const shape=new Shape(),x0=p.x0,x1=p.x1,z=p.z
  const w0=p.side<0?2.4:1.8,w1=p.side<0?1.8:2.4
  shape.moveTo(x0,-z+w0-.3);shape.quadraticCurveTo(x0,-z+w0,x0+.3,-z+w0);shape.lineTo(x1-.3,-z+w1);shape.quadraticCurveTo(x1,-z+w1,x1,-z+w1-.3);shape.lineTo(x1,-z-w1+.3);shape.quadraticCurveTo(x1,-z-w1,x1-.3,-z-w1);shape.lineTo(x0+.3,-z-w0);shape.quadraticCurveTo(x0,-z-w0,x0,-z-w0+.3);shape.closePath()
  const g=new ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false,curveSegments:8});g.rotateX(-Math.PI/2)
  const pos=g.getAttribute('position');for(let i=0;i<pos.count;i++)pos.setY(i,pos.getY(i)-.18+(landingHeight(pos.getX(i),pos.getZ(i))??.085))
  g.computeVertexNormals();bridges.add('stone',g,'#c5baa1')
}
export const crossingArt=bridges.finish()

export const lakeRocks:Part[]=DRAFT_LAKE_ROCKS.map((r,i)=>({p:[r.x,r.y,r.z],s:[...r.size],r:[Math.sin(i)*.1,r.yaw,Math.cos(i)*.12],c:['#989c8f','#b3b4a5','#828e87'][i%3]!}))
export const rockGeometry=new IcosahedronGeometry(1,1)
const pos=rockGeometry.getAttribute('position')
for(let i=0;i<pos.count;i++) {
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),noise=1+Math.sin(x*8+z*5)*Math.cos(y*7-z*3)*.1
  pos.setXYZ(i,x*noise,y*noise,z*noise)
}
rockGeometry.computeVertexNormals()

const plants=new PropBuilder([7,5]),leaf=new Shape()
leaf.moveTo(0,0);leaf.absarc(0,0,1,.18,Math.PI*2-.18,false);leaf.lineTo(0,0)
let pad=0
for(const [cx,cz] of [[55,-49],[71,-5],[58,19]])for(let i=0;i<15;i++) {
  const a=i*2.39996,r=Math.sqrt(i)*.8,x=cx!+Math.cos(a)*r,z=cz!+Math.sin(a)*r
  if(lakeRadius(x,z)>.91||CROSSINGS.some(c=>Math.abs(z-c.z)<c.halfWidth+2))continue
  plants.add('paint',new ShapeGeometry(leaf,12),i%2?'#678351':'#7c995c',[x,.08,z],[.42+i%3*.09,.42+i%3*.09,1],[-Math.PI/2,0,a]);pad++
  if(i%3===0) {
    for(let petal=0;petal<7;petal++) {
      const t=petal*Math.PI*2/7
      plants.ball('paint',i%2?'#e8bac5':'#f1d9c0',[x+Math.cos(t)*.13,.21,z+Math.sin(t)*.13],[.11,.15,.11])
    }
    plants.ball('gold','#e2bb70',[x,.25,z],[.07,.065,.07])
  }
}
for(const [cx,cz] of [[50,-49],[75,14],[69,-51],[48,5]])for(let i=0;i<12;i++) {
  const x=cx!+Math.sin(i*2.4)*1.6,z=cz!+Math.cos(i*1.7)*1.7,h=.6+(i%4)*.17
  if(lakeRadius(x,z)>.98||CROSSINGS.some(c=>Math.abs(z-c.z)<c.halfWidth+2))continue
  plants.cylinder('paint','#68805b',[x,h/2-.12,z],.025,.04,h)
  plants.ball('paint','#836448',[x,h-.12,z],[.065,.16,.065])
}
export const aquaticPlantCount=pad
export const aquaticArt=plants.finish()

// A sloping lake bed makes the two open shore entries meet the water continuously.
const vertices:number[]=[],uv:number[]=[]
for(const [inner,outer] of [[0,.75],[.75,.9],[.9,.96],[.96,1],[1,1.02]])for(let i=0;i<128;i++) {
  const at=(r:number,n:number)=>{const a=n*Math.PI/64,x=DRAFT_LAKE.x+Math.cos(a)*DRAFT_LAKE.rx*r,z=DRAFT_LAKE.z+Math.sin(a)*DRAFT_LAKE.rz*r;return [x,lakeFloorHeight(x,z)-.04,z]}
  const a=at(inner!,i),c=at(outer!,i),d=at(outer!,i+1),e=at(inner!,i+1)
  for(const p of [a,d,c,a,e,d]){vertices.push(...p);uv.push(p[0]!/3,p[2]!/3)}
}
export const lakeBed=new BufferGeometry()
lakeBed.setAttribute('position',new Float32BufferAttribute(vertices,3));lakeBed.setAttribute('uv',new Float32BufferAttribute(uv,2));lakeBed.computeVertexNormals()
