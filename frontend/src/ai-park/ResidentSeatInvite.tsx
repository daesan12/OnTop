import {companionPath} from '../features/ai/serviceFeatures'
import {useId,useRef,useState} from 'react'
import {parkRuntime} from '../park/runtime/runtime'
import {useCompanions,acceptCompanions} from '../features/ai/companions'
import './residentSeatInvite.css'

const choices=[['EASY','강잼민(쉬움)'],['NORMAL','윤한수(보통)'],['HARD','박영감(어려움)']] as const
export function ResidentSeatInvite({disabled}:{disabled:boolean}) {
 const id=useId(),popover=useRef<HTMLDivElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const actors=useCompanions(s=>s.actors)
 async function invite(difficulty:string){if(busy)return;setBusy(true);setError('')
  try{await parkRuntime.requestJSON(companionPath('invite'),{method:'POST',body:JSON.stringify({difficulty})});acceptCompanions(await parkRuntime.requestJSON(companionPath('status')));popover.current?.hidePopover()}
  catch{setError('주민을 부르지 못했어요. 현재 좌석과 주민의 대결 상태를 확인한 뒤 다시 선택해주세요.')}
  finally{setBusy(false)}
 }
 return <>
  <button type="button" className="tablet-empty-seat resident-seat-plus" disabled={disabled||busy} aria-label="오목 AI 상대 선택" aria-haspopup="dialog" popoverTarget={id}>＋<small>주민과 두기</small></button>
  <div ref={popover} id={id} popover="auto" className="resident-seat-picker" role="dialog" aria-label="오목 AI 상대 선택">
   <strong>함께 둘 주민을 골라주세요</strong><p>0냥 · 주민이 뛰어와 앉으면 시작해요.</p>
   {choices.map(([difficulty,label])=>{const occupied=actors.some(a=>a.difficulty===difficulty&&['PLAY_OMOK','APPROACH_OMOK'].includes(a.action??''));return <button key={difficulty} disabled={busy||occupied} onClick={()=>void invite(difficulty)}>{label}{occupied?' · 대결 중':''}</button>})}
   {error&&<p role="alert">{error}</p>}<button type="button" onClick={()=>popover.current?.hidePopover()}>닫기</button>
  </div>
 </>
}
