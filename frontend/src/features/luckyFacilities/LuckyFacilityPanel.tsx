import { useEffect,useRef,useState } from 'react'
import { WHEEL_VALUES,WHEEL_STEP,wheelColor,wheelLanding } from './wheel'
import { closeConstructionNotice } from '../construction/model'
import './luckyFacilities.css'

const spinDuration=3400
const wheelGradient=`conic-gradient(from -${WHEEL_STEP/2}deg,${WHEEL_VALUES.map((value,i)=>`${wheelColor(value)} ${i*WHEEL_STEP}deg ${(i+1)*WHEEL_STEP}deg`).join(',')})`
/** FE mock only. No wallet, inventory, probability contract, purchase or server request. */
export function LuckyFacilityPanel(){
  const dialog=useRef<HTMLDialogElement>(null)
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  const [angle,setAngle]=useState(0),[spinning,setSpinning]=useState(false)
  const [duration,setDuration]=useState(spinDuration)
  const [result,setResult]=useState<number|null>(null)
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
    <h2 id="lucky-title">행운의 돌림판</h2>
    <p id="lucky-description">두근두근, 오늘은 어떤 행운을 만날까요?</p>
    <span className="lucky-mock">무료 목업 체험 · 엽전 차감 및 보상 지급 없음</span>
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
    <footer>온탑 공원 · 뽑기방</footer>
  </dialog>
}
