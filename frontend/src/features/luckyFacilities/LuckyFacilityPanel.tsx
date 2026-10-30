import { useEffect,useRef,useState } from 'react'
import { WHEEL_VALUES,WHEEL_STEP,wheelColor,wheelLanding } from './wheel'
import { closeConstructionNotice } from '../construction/model'
import './luckyFacilities.css'

const spinDuration=3400
const wheelGradient=`conic-gradient(from -${WHEEL_STEP/2}deg,${WHEEL_VALUES.map((value,i)=>`${wheelColor(value)} ${i*WHEEL_STEP}deg ${(i+1)*WHEEL_STEP}deg`).join(',')})`
/** FE mock only. No wallet, inventory, probability contract, purchase or server request. */
export function LuckyFacilityPanel({id}:{id:string}){
  const lottery=id==='layout-drink',dialog=useRef<HTMLDialogElement>(null)
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  const [angle,setAngle]=useState(0),[spinning,setSpinning]=useState(false)
  const [duration,setDuration]=useState(spinDuration)
  const [result,setResult]=useState<number|null>(null),[ticket,setTicket]=useState(false)
  useEffect(()=>{
    const el=dialog.current;el?.showModal();el?.querySelector<HTMLButtonElement>('.lucky-primary')?.focus()
    return()=>{clearTimeout(timer.current);el?.close()}
  },[])
  const spin=()=>{
    if(spinning)return
    const random=crypto.getRandomValues(new Uint32Array(1))[0]!/2**32
    const index=Math.floor(random*WHEEL_VALUES.length)
    setResult(null);setSpinning(true);setAngle(previous=>wheelLanding(previous,index))
    const nextDuration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:spinDuration
    setDuration(nextDuration)
    timer.current=setTimeout(()=>{setResult(WHEEL_VALUES[index]!);setSpinning(false)},nextDuration)
  }
  return <dialog ref={dialog} className="lucky-facility" aria-labelledby="lucky-title" aria-describedby="lucky-description"
    onCancel={e=>{e.preventDefault();closeConstructionNotice()}} onClose={closeConstructionNotice}
    onKeyDown={e=>{
      e.stopPropagation()
      if(e.key!=='Tab')return
      const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])
      const first=buttons[0],last=buttons.at(-1)
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }}>
    <button className="lucky-close" aria-label="시설 닫기" onClick={closeConstructionNotice}>×</button>
    <div className="lucky-eyebrow">ON TOP · 작은 행운이 머무는 곳</div>
    <h2 id="lucky-title">{lottery?'오늘의 복권방':'행운의 돌림판'}</h2>
    <p id="lucky-description">{lottery?'한 장에 담아보는 오늘의 기대':'두근두근, 오늘은 어떤 행운을 만날까요?'}</p>
    <span className="lucky-mock">무료 목업 체험 · 엽전 차감 및 보상 지급 없음</span>
    {lottery?<div className="lucky-ticket-area">
      <div className={'lucky-ticket '+(ticket?'is-revealed':'')}>
        <small>온탑 행운 복권</small><b>{ticket?'행운을 찾았어요!':'오늘의 행운을 열어보세요'}</b>
        <div className="lucky-ticket-symbols">{ticket?'✿　✿　✿':'?　?　?'}</div>
        <span>{ticket?'결과 연출 미리보기 · 실제 당첨 아님':'무료 체험권 · 001'}</span>
      </div>
      <p role="status">{ticket?'복권방 체험 완료! 실제 구매와 당첨 기능은 준비 중이에요.':'버튼을 누르면 복권 결과 연출을 미리 볼 수 있어요.'}</p>
      <button className="lucky-primary" onClick={()=>setTicket(value=>!value)}>{ticket?'새 체험권 받기':'체험권 열어보기'}</button>
    </div>:<>
      <div className="lucky-wheel-stage" aria-hidden="true">
        <div className="lucky-pointer"/>
        <div className="lucky-wheel" style={{background:wheelGradient,transform:`rotate(${angle}deg)`,transitionDuration:`${duration}ms`}}>
          {WHEEL_VALUES.map((value,i)=><span key={i} style={{transform:`translate(-50%,-50%) rotate(${i*WHEEL_STEP}deg) translateY(calc(var(--wheel-size) * -.36))`}}>{value}</span>)}
          <div className="lucky-wheel-hub">福</div>
        </div>
        <div className="lucky-wheel-foot"/>
      </div>
      <div className="lucky-result" role="status" aria-live="polite">{spinning?'행운이 돌아가고 있어요…':result===null?'돌림판을 돌려 오늘의 숫자를 확인해 보세요.':<>오늘의 행운 숫자 <strong>{result}</strong><small>목업 결과예요. 실제 보상은 지급되지 않아요.</small></>}</div>
      <button className="lucky-primary" aria-disabled={spinning} aria-busy={spinning} onClick={spin}>{spinning?'돌아가는 중…':result===null?'무료로 돌려보기':'한 번 더 돌리기'}</button>
    </>}
    <footer>온탑 공원 · {lottery?'복권방':'뽑기방'}</footer>
  </dialog>
}
