import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PaperPopup } from '../../features/tableLobby/PaperPopup'
import { clearRoamingInput } from '../../world/inputOwnership'
import { OmokSurrender, type ForfeitConfirmationControls } from '../OmokSurrender'
import type { SurrenderContext } from '../surrender'
import { cancelAlkkagiItem, useAlkkagiUI } from './parkControls'
import './actions.css'

/** Presentation only: the shared forfeit flow retains authorization and receipt recovery. */
export function AlkkagiSurrender({context,disabled}:{context:SurrenderContext;disabled:boolean}) {
  return <OmokSurrender context={context} disabled={disabled}
    renderConfirmation={controls=><AlkkagiForfeitDialog {...controls} />} />
}

export function AlkkagiForfeitDialog({disabled,onConfirm,onCancel}:ForfeitConfirmationControls) {
  const keepPlaying=useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    cancelAlkkagiItem()
    useAlkkagiUI.setState({dialogOpen:true})
    clearRoamingInput()
    // PaperPopup takes focus first; then choose the reversible action as the default.
    keepPlaying.current?.focus({preventScroll:true})
    return ()=>useAlkkagiUI.setState({dialogOpen:false})
  },[])
  return createPortal(<PaperPopup title="알까기" label="알까기 기권 확인" onClose={onCancel}
    closeLabel="기권 취소" className="alkkagi-forfeit-dialog">
    <div className="alkkagi-forfeit-seal" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M9 27V5m0 1c6-4 9 5 16 0v13c-7 5-10-4-16 0" />
      </svg>
    </div>
    <h2>이번 판을<br />기권할까요?</h2>
    <p className="paper-subtitle">기권하면 이번 판은 패배로 끝나요.</p>
    <div className="alkkagi-forfeit-buttons">
      <button ref={keepPlaying} className="paper-primary" onClick={onCancel}>계속 플레이</button>
      <button className="alkkagi-confirm-forfeit" disabled={disabled} onClick={onConfirm}>기권하기</button>
    </div>
    <small className="alkkagi-dialog-clock-note">확인하는 동안에도 턴 시간은 흘러요.</small>
  </PaperPopup>,document.body)
}
