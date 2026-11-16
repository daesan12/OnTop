import {companionPath} from '../features/ai/serviceFeatures'
import {useEffect} from 'react'
import {parkRuntime} from '../park/runtime/runtime'
import {useSession} from '../network/worldClient'
import {useCompanions,acceptCompanions,resetCompanionActors} from '../features/ai/companions'
import {observedNpcPractice,syncPracticeSpectator} from '../features/ai/practiceSpectator'

const IDLE_POLL_MS = 5_000
const PRACTICE_POLL_MS = 650

/** Keep resident/game state synchronized; entry points live at the NPC and table seat. */
export function CompanionPanel(){
 const room=useSession(s=>s.roomId),table=useSession(s=>s.tableId),own=useSession(s=>s.sessionId)
 useEffect(()=>{useCompanions.setState({finishedPractice:null})},[table,own,room])
 const connected=useSession(s=>s.status==='connected')
 useEffect(() => {
  if (!connected || !room || !own) {
   resetCompanionActors()
   useCompanions.setState({ practice:null, finishedPractice:null, observedPractice:null, practiceChat:null, practicePending:false, practiceError:'', reply:'', waitSeconds:-1 })
   return
  }

  const abort = new AbortController()
  const failure = '주민 상태를 확인하지 못했어요. 다시 연결하고 있어요.'
  let timer: ReturnType<typeof setTimeout> | undefined
  let fastTimer = false
  let pending = false

  const needsFastPoll = () => {
   const { practice, waitSeconds, autoPaused } = useCompanions.getState()
   return Boolean((practice && !practice.snapshot.endedAt) || observedNpcPractice()
    || (table && waitSeconds >= 0 && !autoPaused))
  }
  const schedulePoll = () => {
   fastTimer = needsFastPoll()
   timer = setTimeout(() => {
    timer = undefined
    void poll()
   }, fastTimer ? PRACTICE_POLL_MS : IDLE_POLL_MS)
  }

  const poll = async () => {
   if (abort.signal.aborted || pending || document.hidden) return
   pending = true
   try {
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(8_000)])
    const value = await parkRuntime.requestJSON(companionPath('status'), { signal })
    if (abort.signal.aborted) return
    const previousGameId = observedNpcPractice()?.snapshot.gameId
    if (acceptCompanions(value)) {
     if (syncPracticeSpectator(previousGameId) === 'ended') void parkRuntime.unwatchGame()
     if (useCompanions.getState().practiceError === failure) useCompanions.setState({ practiceError:'' })
    }
   } catch {
    if (!abort.signal.aborted) useCompanions.setState({ practiceError:failure })
   } finally {
    pending = false
    if (!abort.signal.aborted && !document.hidden) schedulePoll()
   }
  }

  // An invite or watch action can start practice while the idle timer is waiting.
  const unsubscribe = useCompanions.subscribe(() => {
   if (timer === undefined || fastTimer || document.hidden || !needsFastPoll()) return
   clearTimeout(timer)
   schedulePoll()
  })
  const refreshVisibility = () => {
   clearTimeout(timer)
   timer = undefined
   if (!document.hidden) void poll()
  }
  document.addEventListener('visibilitychange', refreshVisibility)
  void poll()
  return () => {
   abort.abort()
   clearTimeout(timer)
   unsubscribe()
   document.removeEventListener('visibilitychange', refreshVisibility)
  }
 }, [connected, room, own, table])
 return null
}
