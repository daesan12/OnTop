import { describe,it,expect } from 'vitest'
import { buildPathNetwork } from '../../src/layout-preview/pathNetwork'
import { PATHS,PERIMETER } from '../../src/layout-preview/layout'

function paved(geometry:ReturnType<typeof buildPathNetwork>['geometry'],x:number,z:number) {
  const p=geometry.getAttribute('position')
  for(let i=0;i<p.count;i+=3) {
    const ax=p.getX(i),az=p.getZ(i),bx=p.getX(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cz=p.getZ(i+2)
    const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
    if(Math.abs(d)<1e-8)continue
    const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d
    if(a>=-1e-6&&b>=-1e-6&&a+b<=1+1e-6)return true
  }
  return false
}
describe('continuous slim-corner park paving',()=>{
  it('joins crossing strips into one surface with no grass seams while trimming the sharp outer corners',()=>{
    const {geometry,contours}=buildPathNetwork([{id:'L',width:4,points:[[0,0],[10,0],[10,10]]},{id:'cross',width:3,points:[[5,-8],[5,8]]}])
    expect(contours).toHaveLength(1)
    for(let x=.1;x<10;x+=.25)expect(paved(geometry,x,0)).toBe(true)
    for(let z=.1;z<10;z+=.25)expect(paved(geometry,10,z)).toBe(true)
    expect(paved(geometry,11.95,-1.95)).toBe(false)
    expect(paved(geometry,11,-1)).toBe(true)
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
    geometry.dispose()
  })
  it('keeps the grass island inside a closed loop instead of filling the whole park',()=>{
    const {geometry}=buildPathNetwork([{id:'loop',width:3,points:[[0,0],[20,0],[20,20],[0,20],[0,0]]}])
    expect(paved(geometry,10,10)).toBe(false)
    for(const [x,z] of [[10,0],[20,10],[10,20],[0,10]])expect(paved(geometry,x!,z!)).toBe(true)
    geometry.dispose()
  })
  it('merges a closed woodland ribbon and branching paths without seams or blocked grass islands',()=>{
    const points=Array.from({length:65},(_,i)=>[Math.cos(i*Math.PI/32)*13,Math.sin(i*Math.PI/32)*10.5] as const)
    const {geometry}=buildPathNetwork([{id:'grove',points,width:2.8},{id:'branch',points:[[0,-20],[0,0]],width:3}])
    for(const [x,z] of points)expect(paved(geometry,x,z)).toBe(true)
    for(let z=-19;z<0;z+=.5)expect(paved(geometry,0,z)).toBe(true)
    expect(paved(geometry,6,0)).toBe(false)
    geometry.dispose()
  })
  it('keeps the observation-tower loop smooth on its inner edge and fully paved around all four joins',()=>{
    const {geometry}=buildPathNetwork([...PATHS,{id:'perimeter',width:3.5,points:PERIMETER}])
    for(let i=0;i<360;i++) {
      const a=i*Math.PI/180
      for(const r of [10.6,11.5,12.4])expect(paved(geometry,62+Math.cos(a)*r,56+Math.sin(a)*r),'ring '+i+' radius '+r).toBe(true)
      expect(paved(geometry,62+Math.cos(a)*10,56+Math.sin(a)*10),'inner edge '+i).toBe(false)
    }
    const link=PATHS.find(p=>p.id==='fitness-cart-link')!
    for(const [x,z] of link.points)expect(paved(geometry,x,z)).toBe(true)
    geometry.dispose()
  })
  it('paves all four pagoda approaches across the entire six-metre stair width',()=>{
    const {geometry}=buildPathNetwork([...PATHS,{id:'perimeter',width:3.5,points:PERIMETER}])
    for(const side of [-1,1])for(let r=17.1;r<=22;r+=.2)for(const across of [-2.8,0,2.8]){
      expect(paved(geometry,side*r,-40+across),'east/west '+side+' '+r+' '+across).toBe(true)
      expect(paved(geometry,across,-40+side*r),'north/south '+side+' '+r+' '+across).toBe(true)
    }
    geometry.dispose()
  })
  it('paves the complete west spine, VR crossing and new round-court approach without gaps',()=>{
    const {geometry}=buildPathNetwork([...PATHS,{id:'perimeter',width:3.5,points:PERIMETER}])
    for(let z=-75;z<83;z+=.5)expect(paved(geometry,-39,z),`spine z=${z}`).toBe(true)
    for(let x=-44;x<39;x+=.5)expect(paved(geometry,x,-8),`VR x=${x}`).toBe(true)
    for(let x=-39;x<-20;x+=.5)expect(paved(geometry,x,46),`fitness x=${x}`).toBe(true)
    geometry.dispose()
  })
  it('keeps the established fitness entrance and connecting routes paved',()=>{
    const {geometry}=buildPathNetwork(PATHS)
    for(let z=23;z<=31;z+=.25)expect(paved(geometry,-51,z),`cart approach ${z}`).toBe(true)
    for(let x=-62.8;x<=-51;x+=.25)expect(paved(geometry,x,31),`fitness connection ${x}`).toBe(true)
    for(let z=31;z<=52;z+=.25)expect(paved(geometry,-63,z),`fitness north ${z}`).toBe(true)
    geometry.dispose()
  })
})
