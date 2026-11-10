export interface RecreationFacility {
  id:string;kind:'arcade'|'mole'|'gacha'|'fortune';label:string;x:number;z:number;
  width:number;depth:number;height:number;yaw:number;doorWidth:number;modelScale?:number
}
export interface RecreationBox {id:string;center:[number,number,number];half:[number,number,number];yaw:number}
export type ArcadeCabinetGame='rps-roulette'|'plus-minus'
export interface RecreationMachine {id:string;x:number;z:number;width:number;depth:number;height:number;yaw:number;game?:ArcadeCabinetGame}
/** Preserve the approved 18×12 design and uniformly fit it into the authored plot. */
export const arcadeScale=(f:RecreationFacility)=>f.kind==='arcade'?f.width/18:1
export const fortuneScale=(f:RecreationFacility)=>f.kind==='fortune'?(f.modelScale??1):1
export function arcadeDesign(f:RecreationFacility):RecreationFacility{
  return f.kind==='arcade'?{...f,width:18,depth:12,height:6.4,doorWidth:4.6}:f
}
/** Ground-level rocks frame the mole shop while keeping its central approach open. */
export function moleShopRocks(f:RecreationFacility){
  if(f.kind!=='mole')return []
  return Array.from({length:28},(_,i)=>{
    const angle=i*Math.PI*2/28,x=Math.sin(angle)*(f.width/2+.12),z=Math.cos(angle)*(Math.cos(angle)>0?5.45:f.depth/2+.3)
    return {id:f.id+'-rock-'+i,x,z,rx:.42+(i%3)*.1,ry:.25+(i%4)*.055,rz:.36+(i%3)*.08,yaw:i*1.7}
  }).filter(r=>!(r.z>0&&Math.abs(r.x)<2.8))
}
export function recreationPoint(f:RecreationFacility,x:number,z:number):[number,number]{return [f.x+x*Math.cos(f.yaw)+z*Math.sin(f.yaw),f.z-x*Math.sin(f.yaw)+z*Math.cos(f.yaw)]}
export function inRecreation(x:number,z:number,facilities:readonly RecreationFacility[],padding=0){
  return facilities.some(f=>{const dx=x-f.x,dz=z-f.z,c=Math.cos(f.yaw),s=Math.sin(f.yaw);return Math.abs(dx*c-dz*s)<f.width/2+padding&&Math.abs(dx*s+dz*c)<f.depth/2+padding})
}
export function recreationMachines(f:RecreationFacility):RecreationMachine[]{
  if(f.kind==='fortune')return []
  if(f.kind==='gacha')return [{id:f.id+'-machine-0',x:0,z:0,width:3.6,depth:3.9,height:5.98,yaw:0}]
  if(f.kind==='mole')return [-1.05,1.05].map((x,i)=>({id:f.id+'-machine-'+i,x,z:1.3,width:1.9,depth:1.6,height:2.5,yaw:0}))
  // Keep the first two back-wall slots; the remaining floor is reserved for future games.
  const s=arcadeScale(f)
  return [-6,-2].map((x,i)=>({id:f.id+'-machine-'+i,x:x*s,z:-3.6*s,width:1.9*s,depth:1.75*s,height:3.2*s,yaw:0,game:i===0?'rps-roulette':'plus-minus'}))
}
/** Visible walls and cabinet bodies share these dimensions; the doorway stays open. */
export function recreationBoxes(facilities:readonly RecreationFacility[]):RecreationBox[]{
  return facilities.flatMap(f=>{
    const boxes:RecreationBox[]=[]
    const add=(id:string,x:number,y:number,z:number,hx:number,hy:number,hz:number,yaw=0)=>{const p=recreationPoint(f,x,z);boxes.push({id:f.id+'-'+id,center:[p[0],y,p[1]],half:[hx,hy,hz],yaw:f.yaw+yaw})}
    if(f.kind==='fortune'){
      // Closed service counter, not an arcade walk-in shell. The roof overhang stays walkable.
      const s=fortuneScale(f)
      add('counter-body',0,.14+1.52*s,.2*s,1.61*s,1.52*s,1.1*s)
      add('banner-post',-2.22*s,1.65*s,.72*s,.23*s,1.65*s,.24*s)
      return boxes
    }
    if(f.kind!=='gacha'){
      add('back',0,f.height/2,-f.depth/2,f.width/2,f.height/2,.16)
      for(const side of [-1,1]){
        add('side-'+side,side*f.width/2,f.height/2,0,.16,f.height/2,f.depth/2)
        const span=(f.width-f.doorWidth)/2
        add('front-'+side,side*(f.doorWidth/2+span/2),f.height/2,f.depth/2,span/2,f.height/2,.16)
      }
    }
    if(f.kind==='mole')for(const side of [-1,1])add('paw-'+side,side*3.75,.8,2.9,1.25,.8,1.45)
    for(const r of moleShopRocks(f))add('rock-'+r.id.split('-').at(-1),r.x,r.ry,r.z,r.rx,r.ry,r.rz,r.yaw)
    for(const m of recreationMachines(f)){const p=recreationPoint(f,m.x,m.z);boxes.push({id:m.id,center:[p[0],.14+m.height/2,p[1]],half:[m.width/2,m.height/2,m.depth/2],yaw:f.yaw+m.yaw})}
    return boxes
  })
}
