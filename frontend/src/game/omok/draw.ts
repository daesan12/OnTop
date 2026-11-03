import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import { estimatedServerTime } from '../../network/worldClient'

export type OmokDrawInput = {kind:'drawRequest'} | {kind:'drawRespond';requestId:string;accept:boolean}

export function canDrawAction(own:string,input:OmokDrawInput,now=estimatedServerTime()) {
  const s=useGame.getState(),g=s.game,o=g?.omok
  if(!o || g.role!=='PLAYER' || g.gameId!==s.permittedGameId || s.recovery!=='RESTORED'
    || ![o.blackUserId,o.whiteUserId].includes(own) || s.pending || s.uncertain || forfeitBlocksInput(g.gameId)
    || g.version<s.awaitingVersion || ['STARTING','CONFIRMED','SETTLING'].includes(s.start?.phase??'')
    || o.status!=='PLAYING' || o.draw===undefined || !o.drawRequestsUsed || o.undo) return false
  if(input.kind==='drawRequest') return !o.draw && o.turnUserId===own && !o.drawRequestsUsed.includes(own)
    && (!o.coinTossEndsAt || Date.parse(o.coinTossEndsAt)<=now) && Date.parse(o.turnDeadline!)>now
  return !!o.draw && o.draw.requesterUserId!==own && o.draw.requestId===input.requestId && Date.parse(o.draw.deadline)>now
}
