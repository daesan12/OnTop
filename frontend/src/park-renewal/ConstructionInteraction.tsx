import {useEffect,useRef,useState} from 'react'
import {constructionEntries,nearestConstruction} from './constructionPlan'
import '../features/construction/construction.css'
export const previewActor={current:{x:0,y:4.8,z:108}}
export function ConstructionInteraction({enabled,onBlocked}:{enabled:boolean;onBlocked:(v:boolean)=>void}){
 const[target,setTarget]=useState<string|null>(null),[open,setOpen]=useState<string|null>(null),dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const tick=()=>setTarget(enabled?nearestConstruction(previewActor.current)?.id??null:null);tick();const timer=setInterval(tick,150);return()=>clearInterval(timer)},[enabled])
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code!=='KeyE'||e.repeat||!enabled||open||e.ctrlKey||e.altKey||e.shiftKey||e.target instanceof Element&&e.target.closest('input,textarea,select,dialog'))return;const id=nearestConstruction(previewActor.current)?.id;if(id){e.preventDefault();setOpen(id)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[enabled,open])
 useEffect(()=>{onBlocked(!!open);if(open)dialog.current?.showModal();else dialog.current?.close();return()=>onBlocked(false)},[open,onBlocked])
 const s=constructionEntries.find(s=>s.id===open)
 return <>{target&&!open&&<div className="renewal-construction-interact renewal-ui"><button onClick={()=>setOpen(target)}><kbd>E</kbd> {constructionEntries.find(s=>s.id===target)?.label} 이용하기</button></div>}<dialog ref={dialog} className="construction-notice" aria-label={(s?.label??'시설')+' 공사 안내'} onCancel={e=>{e.preventDefault();setOpen(null)}} onClose={()=>setOpen(null)}><small>온탑 공원 · {s?.label}</small><h2>공사 중</h2><p>{s?.message}</p><button autoFocus onClick={()=>setOpen(null)}>확인</button></dialog></>
}
