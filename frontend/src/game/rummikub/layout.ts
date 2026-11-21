import type { Placed } from './protocol'
import type { TileDestination } from './edit'

export const TILE_PITCH = .212, ROW_PITCH = .32, PUBLIC_TOP = -.86, PUBLIC_BASE_SCALE = .66
const WIDTH = 2.2, GROUP_GAP = .1, TILE_HALF_DEPTH = .131

export function rackLayout(count: number) {
  const racks = Math.max(1,Math.ceil(count/14)), scale = Math.min(1,1.25/(racks*.56))
  return {racks,scale,z:.65-(racks-1)*.28*scale,step:.56,depth:.52}
}

/** Repack at the largest scale that fits; shrinking fixed rows wastes space. */
export function layoutMelds(lengths: number[], handCount = 14) {
  const widths = lengths.map(n=>n*TILE_PITCH+.14), rack=rackLayout(handCount)
  // The raised backrest also covers space in the camera projection. An XZ-only
  // gap lets the last long run disappear behind its upper edge.
  const bottom=Math.min(.12,rack.z-(rack.depth/2+.24)*rack.scale-.04)
  const pack = (scale: number) => {
    const rows: {items:{index:number;width:number}[];width:number}[]=[]
    widths.forEach((width,index)=>{
      let row=rows.at(-1)
      if(!row || row.width+GROUP_GAP+width>WIDTH/scale) { row={items:[],width:0};rows.push(row) }
      if(row.items.length)row.width+=GROUP_GAP
      row.items.push({index,width});row.width+=width
    })
    return rows
  }
  let scale=PUBLIC_BASE_SCALE,rows=pack(scale)
  while(scale>.2 && (Math.max(0,...rows.map(r=>r.width))*scale>WIDTH || PUBLIC_TOP+((rows.length-1)*ROW_PITCH+TILE_HALF_DEPTH)*scale>bottom)) {
    scale=Number((scale-.005).toFixed(3));rows=pack(scale)
  }
  const positions=lengths.map(()=>({x:0,z:0}))
  rows.forEach((row,line)=>{
    let cursor=-row.width/2
    row.items.forEach(item=>{
      positions[item.index]={x:cursor+item.width/2+.07,z:line*ROW_PITCH}
      cursor+=item.width+GROUP_GAP
    })
  })
  return {scale,positions,originZ:PUBLIC_TOP,bottom}
}

/** Rendering and drop tests share dimensions, including a crowded board. */
export function tileDropTarget(melds: Placed[][], handCount: number, x: number, z: number): {destination:TileDestination;x:number;z:number;width:number;depth:number} | null {
  if(!Number.isFinite(x)||!Number.isFinite(z))return null
  const rack=rackLayout(handCount)
  for(let r=0;r<rack.racks;r++) {
    const center=rack.z+r*rack.step*rack.scale
    if(Math.abs(x)<=1.04*rack.scale&&Math.abs(z-center)<=rack.depth/2*rack.scale)
      return {destination:{kind:'rack'},x:0,z:center,width:2.08*rack.scale,depth:rack.depth*rack.scale}
  }
  if(Math.abs(x)>1.175||z<-.98||z>.3)return null
  const layout=layoutMelds(melds.map(m=>m.length),handCount),scale=layout.scale
  for(let i=0;i<melds.length;i++) {
    const p=layout.positions[i]!,cx=p.x*scale,cz=layout.originZ+p.z*scale
    const width=(melds[i]!.length*TILE_PITCH+.14)*scale
    if(Math.abs(x-cx)<=width/2+.018&&Math.abs(z-cz)<=.15*scale) {
      const tile=melds[i]!.find((_,n)=>Math.abs(x-(cx+(n-(melds[i]!.length-1)/2)*TILE_PITCH*scale))<.09*scale&&Math.abs(z-cz)<.125*scale)
      return {destination:{kind:'meld',index:i,replace:tile?.id},x:cx-.07*scale,z:cz,width,depth:.29*scale}
    }
  }
  return {destination:{kind:'new'},x,z,width:.23,depth:.20}
}
