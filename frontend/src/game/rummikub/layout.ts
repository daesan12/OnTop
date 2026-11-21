import type { Placed } from './protocol'
import type { TileDestination } from './edit'

/** 작은 조합은 같은 줄에 두고, 공개 판이 받침대를 침범하지 않도록 전체 배율을 제한한다. */
export function layoutMelds(lengths: number[]) {
  const widths = lengths.map(n => n * .212 + .14)
  const available = Math.max(2.2, ...widths)
  const rows: { items: { index: number; width: number }[]; width: number }[] = []
  widths.forEach((width, index) => {
    let row = rows.at(-1)
    if (!row || row.width + .1 + width > available) { row = {items: [], width: 0}; rows.push(row) }
    if (row.items.length) row.width += .1
    row.items.push({index, width}); row.width += width
  })
  const scale = Math.min(1, 2.2 / available, .74 / Math.max(.74, (rows.length - 1) * .32))
  const positions = lengths.map(() => ({x: 0, z: 0}))
  rows.forEach((row, line) => {
    let cursor = -row.width / 2
    row.items.forEach(item => {
      positions[item.index] = {x: cursor + item.width / 2 + .07, z: line * .32}
      cursor += item.width + .1
    })
  })
  return {scale, positions}
}

export function rackLayout(count: number) {
  const racks = Math.max(1,Math.ceil(count/14)), scale = Math.min(1,1.8/Math.max(1.8,racks*.82))
  return {racks,scale,z:.6-(racks-1)*.41*scale}
}

/** Same local coordinates as the rendered meshes, including rotated player seats. */
export function tileDropTarget(melds: Placed[][], handCount: number, x: number, z: number): {destination:TileDestination;x:number;z:number;width:number;depth:number} | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  const rack=rackLayout(handCount)
  for(let r=0;r<rack.racks;r++) {
    const center=rack.z+r*.85*rack.scale
    if (Math.abs(x)<=1.04*rack.scale && Math.abs(z-center)<=.41*rack.scale)
      return {destination:{kind:'rack'},x:0,z:center,width:2.08*rack.scale,depth:.82*rack.scale}
  }
  if (Math.abs(x)>1.175 || z<-.98 || z>.25) return null
  const layout=layoutMelds(melds.map(m=>m.length)), scale=layout.scale
  for(let i=0;i<melds.length;i++) {
    const p=layout.positions[i]!, cx=p.x*scale, cz=-.65+p.z*scale
    const width=(melds[i]!.length*.212+.14)*scale
    if (Math.abs(x-cx)<=width/2+.035 && Math.abs(z-cz)<=.15*scale) {
      const tile=melds[i]!.find((_,n)=>Math.abs(x-(cx+(n-(melds[i]!.length-1)/2)*.212*scale))<.09*scale && Math.abs(z-cz)<.125*scale)
      return {destination:{kind:'meld',index:i,replace:tile?.id},x:cx-.07*scale,z:cz,width,depth:.29*scale}
    }
  }
  return {destination:{kind:'new'},x,z,width:.34,depth:.29}
}
