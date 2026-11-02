import { useEffect,useRef } from 'react'
import { LuckyFacilityPanel } from '../luckyFacilities/LuckyFacilityPanel'
import { RafflePanel } from '../raffle/RafflePanel'
import { constructionSites,useConstructionNotice,closeConstructionNotice } from './model'
import './construction.css'

/** The lottery room opens the weekly raffle; other sites stay local information without shopping, photo or server leases. */
export function ConstructionNotice(){
  const id=useConstructionNotice(s=>s.id)
  useEffect(()=>()=>closeConstructionNotice(),[])
  if(id==='layout-drink')return <RafflePanel/>
  if(id==='layout-shop')return <LuckyFacilityPanel/>
  return <ConstructionMessage/>
}
function ConstructionMessage(){
  const id=useConstructionNotice(s=>s.id),dialog=useRef<HTMLDialogElement>(null)
  const site=constructionSites.find(s=>s.id===id)
  useEffect(()=>{
    if(!id)return
    const element=dialog.current
    element?.showModal()
    return()=>{element?.close()}
  },[id])
  if(!site)return null
  return <dialog ref={dialog} className="construction-notice" aria-label={`${site.label} 공사 안내`} aria-describedby="construction-description"
    onKeyDown={event=>{if(event.key==='Tab'){event.preventDefault();event.stopPropagation();dialog.current?.querySelector('button')?.focus()}}}
    onCancel={event=>{event.preventDefault();closeConstructionNotice()}} onClose={closeConstructionNotice}>
    <small>온탑 공원 · {site.label}</small><h2>공사 중</h2>
    <p id="construction-description">{site.message}</p>
    <button type="button" autoFocus onClick={closeConstructionNotice}>확인</button>
  </dialog>
}
