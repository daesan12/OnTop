import { lazy,Suspense,useEffect,useLayoutEffect,useRef } from 'react'
import { constructionSites,useConstructionNotice,closeConstructionNotice } from './model'
import './construction.css'

const GachaPanel=lazy(()=>import('../gacha/GachaPanel').then(module=>({default:module.GachaPanel})))
const RafflePanel=lazy(()=>import('../raffle/RafflePanel').then(module=>({default:module.RafflePanel})))

/** Registered kiosks open their real flow; unavailable sites retain the construction notice. */
export function ConstructionNotice(){
  const id=useConstructionNotice(s=>s.id)
  useEffect(()=>()=>closeConstructionNotice(),[])
  if(id==='layout-drink')return <Suspense fallback={<ConstructionLoading label="복권방"/>}><RafflePanel/></Suspense>
  if(id==='layout-shop')return <Suspense fallback={<ConstructionLoading label="뽑기"/>}><GachaPanel/></Suspense>
  return <ConstructionMessage/>
}
function ConstructionLoading({label}:{label:string}){
  const dialog=useRef<HTMLDialogElement>(null)
  useLayoutEffect(()=>{
    const element=dialog.current
    element?.showModal()
    return()=>element?.close()
  },[])
  return <dialog ref={dialog} className="construction-notice" aria-label={label}
    onCancel={event=>{event.preventDefault();closeConstructionNotice()}}>
    <p role="status">{label} 화면을 불러오는 중입니다.</p>
    <button type="button" onClick={closeConstructionNotice}>취소</button>
  </dialog>
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
