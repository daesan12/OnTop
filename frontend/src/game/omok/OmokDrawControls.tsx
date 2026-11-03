import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { canDrawAction, type OmokDrawInput } from './draw'
import type { Omok } from '../protocol'
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
  return <aside className="omok-undo" role="group" aria-label="오목 무승부 요청" data-pending={!!draw}>
    {draw?<>
      <p role="status">{draw.requesterUserId===own?'상대의 무승부 응답을 기다립니다.':'상대가 무승부를 요청했어요.'} 응답까지 {Math.ceil(remaining/1000)}초</p>
      <progress aria-label="무승부 응답 남은 시간" max={10000} value={Math.min(10000,remaining)} />
      <small>요청자의 착수 제한시간은 계속 흘러요.</small>
      {draw.requesterUserId!==own&&<>
        <button disabled={responseDisabled} onClick={()=>void send({kind:'drawRespond',requestId:draw.requestId,accept:true})}>무승부</button>
        <button disabled={responseDisabled} onClick={()=>void send({kind:'drawRespond',requestId:draw.requestId,accept:false})}>거절</button>
      </>}
    </>:<>
      <button disabled={requestDisabled} title="내 차례에 경기당 한 번 요청할 수 있어요. 상대 동의가 필요해요."
        onClick={()=>void send({kind:'drawRequest'})}>무승부 요청</button>
      {o.drawRequestsUsed?.includes(own)&&<small>이번 경기의 무승부 요청을 사용했어요.</small>}
      {o.drawDecision&&<span role="status">{o.drawDecision.status==='REJECTED'?'무승부 요청이 거절됐어요.':o.drawDecision.status==='EXPIRED'?'응답 시간이 지나 무승부 요청이 취소됐어요.':'서로 동의해 무승부로 끝났어요.'}</span>}
    </>}
  </aside>
}
