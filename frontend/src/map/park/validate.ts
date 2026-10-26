import type { ParkDefinition } from './definition'
export function assertUniqueIds(label:string,items:readonly {id:string}[]) {
  const seen=new Set<string>()
  for(const item of items){if(!item.id||seen.has(item.id))throw new Error(`${label}: duplicate or empty ID ${item.id}`);seen.add(item.id)}
}
export function validateParkDefinition(d:ParkDefinition) {
  const finite=(v:unknown,path:string)=>{
    if(typeof v==='number'&&!Number.isFinite(v))throw new Error(`${path} must be finite`)
    if(Array.isArray(v))v.forEach((n,i)=>finite(n,`${path}[${i}]`))
    else if(v&&typeof v==='object')for(const [k,n] of Object.entries(v))finite(n,`${path}.${k}`)
  }
  finite(d,'map')
  const positive=(n:number,path:string)=>{if(!(n>0))throw new Error(`${path} must be positive`)}
  const half=d.park.size/2
  positive(d.park.size,'park.size')
  if(d.park.backgroundSize<d.park.size)throw new Error('backgroundSize must cover the park')
  if(d.park.movementInset<0||d.park.movementInset>=half)throw new Error('invalid movementInset')
  for(const [name,n] of Object.entries({wallCornerRadius:d.park.wallCornerRadius,movementCornerRadius:d.park.movementCornerRadius,perimeterCornerRadius:d.park.perimeterCornerRadius}))if(n<0||n>half-d.park.perimeterInset)throw new Error(`invalid ${name}`)
  const point=(x:number,z:number,path:string)=>{if(Math.abs(x)>half||Math.abs(z)>half)throw new Error(`${path} is outside the park`)}
  point(...d.park.spawn,'park.spawn')
  for(const [id,p] of Object.entries(d.sites))point(p.x,p.z,`sites.${id}`)
  for(const [id,p] of Object.entries(d.pavilions))point(...p,`pavilions.${id}`)
  for(const [id,p] of Object.entries(d.tables))point(...p,`tables.${id}`)
  if(d.gate.opening!==d.gate.boundaryOpening||d.gate.postX*2!==d.gate.opening)throw new Error('gate opening and posts must align')
  positive(d.gate.opening,'gate.opening')
  for(const [id,k] of Object.entries(d.kiosks)){positive(k.width,`${id}.width`);positive(k.depth,`${id}.depth`)}
  for(const [id,n] of Object.entries({rx:d.lake.rx,rz:d.lake.rz,depth:d.lake.depth,swimmingThreshold:d.lake.swimmingThreshold,fountainScale:d.fountain.scale,vrWidth:d.vrCourt.width,vrDepth:d.vrCourt.depth}))positive(n,id)
  for(const n of Object.values(d.collision))if(n<0)throw new Error('collision clearances cannot be negative')
  if(d.collision.fitnessBenchGapSin>=1||d.collision.fitnessBenchOuter<=d.collision.fitnessBenchInner)throw new Error('invalid fitness bench geometry')
  if(!d.lake.crossings.some(c=>c.kind==='wood')||d.lake.decks.length!==2)throw new Error('lake requires the existing wood bridge and two fishing decks')
  for(const c of d.lake.crossings){if(Math.abs(c.offsetZ)>=d.lake.rz)throw new Error(`${c.id} misses the lake`);positive(c.halfWidth,`${c.id}.halfWidth`)}
  for(const route of d.routes){positive(route.width,`${route.id}.width`);if(route.points.length<2)throw new Error(`${route.id} needs two points`);route.points.forEach(p=>point(...p,route.id))}
  for(const [label,items] of Object.entries({routes:d.routes,crossings:d.lake.crossings,decks:d.lake.decks,gardens:d.plazaRestGardens,benches:d.plazaRestBenches,bins:d.plazaBins,stoneSets:d.vrStoneSets}))assertUniqueIds(label,items)
  for(const id of d.curvedRoutes)if(!d.routes.some(r=>r.id===id))throw new Error(`missing curved route ${id}`)
}
