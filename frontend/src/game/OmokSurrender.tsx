import { useState } from 'react'
import { surrenderService } from './surrender'
import type { SurrenderContext } from './surrender'

export function OmokSurrender({ context, disabled }: { context: SurrenderContext; disabled: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const [completed, setCompleted] = useState(false)
  if (import.meta.env.DEV && import.meta.env.MODE === 'facility-preview') {
    return <div className="omok-surrender-preview">
      <p>수동 기권 목업 · 실제 경기·좌석·정산은 바뀌지 않습니다.</p>
      {completed ? <p role="status">기권 의사 확인 미리보기 완료 · 실제 경기는 계속됩니다.</p>
        : confirm && !disabled ? <div role="group" aria-label="기권 미리보기 확인">
          <p>기권 의사를 확인할까요? 이 미리보기는 서버에 전송되지 않습니다.</p>
          <button onClick={() => { surrenderService.preview(context); setCompleted(true); setConfirm(false) }}>기권 확인 (목업)</button>
          <button onClick={() => setConfirm(false)}>계속 두기</button>
        </div> : <button disabled={disabled} onClick={() => setConfirm(true)}>기권 미리보기 (목업)</button>}
    </div>
  }
  return <div><button disabled>기권</button><small>수동 기권은 서버 API 연결 후 이용할 수 있습니다.</small></div>
}
