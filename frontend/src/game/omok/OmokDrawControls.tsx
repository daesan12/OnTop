import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { canDrawAction, type OmokDrawInput } from './draw'
import type { Omok } from '../protocol'
import { OmokRequestCard } from './OmokRequestCard'
import './omokUndo.css'

export function OmokDrawControls({now}:{now:number}) {
  const runtime=useParkRuntime(),s=useGame(),own=useSession(s=>s.sessionId)
  const connected=useSession(s=>s.status==='connected'&&!s.pending),o=s.game?.omok,draw=o?.draw
  if(!o || s.game?.role!=='PLAYER' || o.status!=='PLAYING' || o.draw===undefined || !o.drawRequestsUsed || o.undo || !runtime.actOmokDraw) return null
  return <OmokDrawCard omok={o} own={own} now={now} send={runtime.actOmokDraw}
    requestDisabled={!connected || !canDrawAction(own,{kind:'drawRequest'},now)}
    responseDisabled={!connected || !draw || !canDrawAction(own,{kind:'drawRespond',requestId:draw.requestId,accept:true},now)} />
}

export function OmokDrawCard({omok:o,own,now,send,requestDisabled,responseDisabled}:{
  omok:Omok;own:string;now:number;send(input:OmokDrawInput):Promise<boolean>;requestDisabled:boolean;responseDisabled:boolean
}) {
  const draw=o.draw,remaining=draw?Math.max(0,Date.parse(draw.deadline)-now):0
  return <OmokRequestCard label="무승부" symbol="=" pending={!!draw} requester={draw?.requesterUserId === own}
    remaining={remaining} requestDisabled={requestDisabled} responseDisabled={responseDisabled} used={o.drawRequestsUsed?.includes(own)}
    requestHint="내 차례에 경기당 한 번 요청합니다. 상대 동의가 필요하고 착수 시계는 계속 진행됩니다."
    decisionId={o.drawDecision?.requestId}
    decision={o.drawDecision ? o.drawDecision.status === 'REJECTED' ? '상대가 거절했어요.' : o.drawDecision.status === 'EXPIRED' ? '응답 시간이 끝났어요.' : '합의 무승부' : undefined}
    onRequest={() => void send({kind:'drawRequest'})}
    onRespond={accept => { if (draw) void send({kind:'drawRespond',requestId:draw.requestId,accept}) }} />
}
