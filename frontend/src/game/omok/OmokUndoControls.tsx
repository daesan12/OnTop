import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { canUndoAction, type OmokUndoInput } from './undo'
import type { Omok } from '../protocol'
import './omokUndo.css'

export function OmokUndoControls({ now }: { now: number }) {
  const runtime = useParkRuntime(), s = useGame(), own = useSession(s => s.sessionId)
  const connected = useSession(s => s.status === 'connected' && !s.pending)
  const o = s.game?.omok, undo = o?.undo
  if (!o || s.game?.role !== 'PLAYER' || o.status !== 'PLAYING' || o.undo === undefined || !runtime.actOmokUndo) return null
  return <OmokUndoCard omok={o} own={own} now={now} send={runtime.actOmokUndo}
    requestDisabled={!connected || !canUndoAction(own,{kind:'undoRequest'},now)}
    responseDisabled={!connected || !undo || !canUndoAction(own,{kind:'undoRespond',requestId:undo.requestId,accept:true},now)} />
}

export function OmokUndoCard({omok:o,own,now,send,requestDisabled,responseDisabled}: {
  omok:Omok;own:string;now:number;send(input:OmokUndoInput):Promise<boolean>;requestDisabled:boolean;responseDisabled:boolean
}) {
  const undo=o.undo
  const remaining = undo ? Math.max(0, Date.parse(undo.deadline) - now) : 0
  return <aside className="omok-undo" role="group" aria-label="오목 무르기" data-pending={!!undo}>
    {undo ? <>
      <p role="status">{undo.requesterUserId === own ? '상대의 무르기 응답을 기다립니다.' : '상대가 직전 두 돌의 무르기를 요청했어요.'}
        {' '}응답까지 {Math.ceil(remaining / 1000)}초</p>
      <progress aria-label="무르기 응답 남은 시간" max={10000} value={Math.min(10000,remaining)} />
      <small>요청자의 착수 제한시간은 계속 흘러요.</small>
      {undo.requesterUserId !== own && <>
        <button disabled={responseDisabled}
          onClick={() => void send({ kind: 'undoRespond', requestId: undo.requestId, accept: true })}>두 돌 무르기 수락</button>
        <button disabled={responseDisabled}
          onClick={() => void send({ kind: 'undoRespond', requestId: undo.requestId, accept: false })}>무르기 거절</button>
      </>}
    </> : <>
      <button title="상대 동의 후 내 이전 돌과 상대 응수를 취소합니다. 횟수 제한은 없습니다."
        disabled={requestDisabled}
        onClick={() => void send({ kind: 'undoRequest' })}>무르기 요청</button>
      {o.undoDecision && <span role="status">{o.undoDecision.status === 'ACCEPTED' ? '두 돌을 무르고 같은 차례로 돌아왔어요.'
        : o.undoDecision.status === 'REJECTED' ? '무르기 요청이 거절됐어요.' : '응답 시간이 지나 무르기가 취소됐어요.'}</span>}
    </>}
  </aside>
}
