import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { canUndoAction, type OmokUndoInput } from './undo'
import type { Omok } from '../protocol'
import { OmokRequestCard } from './OmokRequestCard'
import './omokUndo.css'

export function OmokUndoControls({ now }: { now: number }) {
  const runtime = useParkRuntime(), s = useGame(), own = useSession(s => s.sessionId)
  const connected = useSession(s => s.status === 'connected' && !s.pending)
  const o = s.game?.omok, undo = o?.undo
  if (!o || s.game?.role !== 'PLAYER' || o.status !== 'PLAYING' || o.undo === undefined || o.draw || !runtime.actOmokUndo) return null
  return <OmokUndoCard omok={o} own={own} now={now} send={runtime.actOmokUndo}
    requestDisabled={!connected || !canUndoAction(own,{kind:'undoRequest'},now)}
    responseDisabled={!connected || !undo || !canUndoAction(own,{kind:'undoRespond',requestId:undo.requestId,accept:true},now)} />
}

export function OmokUndoCard({omok:o,own,now,send,requestDisabled,responseDisabled}: {
  omok:Omok;own:string;now:number;send(input:OmokUndoInput):Promise<boolean>;requestDisabled:boolean;responseDisabled:boolean
}) {
  const undo=o.undo
  const remaining = undo ? Math.max(0, Date.parse(undo.deadline) - now) : 0
  return <OmokRequestCard label="무르기" symbol="↶" pending={!!undo} requester={undo?.requesterUserId === own}
    remaining={remaining} requestDisabled={requestDisabled} responseDisabled={responseDisabled}
    requestHint="내 차례에 상대 동의로 직전 두 돌을 무릅니다. 횟수 제한은 없고 착수 시계는 계속 진행됩니다."
    decisionId={o.undoDecision?.requestId}
    decision={o.undoDecision ? o.undoDecision.status === 'ACCEPTED' ? '무르기 완료' : o.undoDecision.status === 'REJECTED' ? '상대가 거절했어요.' : '응답 시간이 끝났어요.' : undefined}
    onRequest={() => void send({kind:'undoRequest'})}
    onRespond={accept => { if (undo) void send({kind:'undoRespond',requestId:undo.requestId,accept}) }} />
}
