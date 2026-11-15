import { create } from 'zustand'
import { PARK_DATA } from '../../map/park'
import { renewalMap } from '../../park/renewalMap'
import { clearRoamingInput } from '../../world/inputOwnership'

export const constructionSites=renewalMap?.data.interactions.construction ?? PARK_DATA.interactions.construction
export function canReachConstruction(p:{x:number;y:number;z:number},id:string){
  const site=constructionSites.find(s=>s.id===id)
  return !!site&&[p.x,p.y,p.z].every(Number.isFinite)
    &&Math.hypot(p.x-site.reachPosition[0],p.z-site.reachPosition[2])<=site.radius
    &&Math.abs(p.y-site.reachPosition[1])<=site.heightTolerance
}
export const useConstructionNotice=create<{id:string|null}>(()=>({id:null}))
function showNotice(id:string){
  clearRoamingInput()
  useConstructionNotice.setState({id})
}
export function openConstructionNotice(id:string){
  if(constructionSites.some(s=>s.id===id))showNotice(id)
}
export const openParkGacha=()=>showNotice('layout-shop')
export const closeConstructionNotice=()=>useConstructionNotice.setState({id:null})
