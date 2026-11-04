import {useEffect,useMemo} from 'react'
import type {ParkRuntimePort} from '../../park/runtime/contracts'
import {useSession} from '../../network/worldClient'
import {TypingReporter} from './typingReporter'

export function useChatTyping(runtime:ParkRuntimePort,enabled:boolean) {
  const channel=useSession(s=>s.roomId),status=useSession(s=>s.status),user=useSession(s=>s.sessionId)
  const reporter=useMemo(()=>new TypingReporter(value=>runtime.sendTyping?.(value)),[runtime])
  useEffect(()=>{if(!enabled||status!=='connected')reporter.stop();return()=>reporter.stop()},[reporter,enabled,status,channel,user])
  return (hasText:boolean)=>{if(enabled&&status==='connected'&&channel)reporter.changed(hasText);else reporter.stop()}
}
