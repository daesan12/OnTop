import { create } from 'zustand'
import { PARK_DATA } from '../../map/park'
import { clearRoamingInput } from '../../world/inputOwnership'

export const constructionSites=PARK_DATA.interactions.construction
export function canReachConstruction(p:{x:number;y:number;z:number},id:string){
  const site=constructionSites.find(s=>s.id===id)
  return !!site&&[p.x,p.y,p.z].every(Number.isFinite)
    &&Math.hypot(p.x-site.reachPosition[0],p.z-site.reachPosition[2])<=site.radius
    &&Math.abs(p.y-site.reachPosition[1])<=site.heightTolerance
}
export const useConstructionNotice=create<{id:string|null}>(()=>({id:null}))
export function openConstructionNotice(id:string){
  if(!constructionSites.some(s=>s.id===id))return
  clearRoamingInput()
  useConstructionNotice.setState({id})
}
export const closeConstructionNotice=()=>useConstructionNotice.setState({id:null})
