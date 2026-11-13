import {useCompanions} from './companions'
import {practiceAction} from '../../ai-park/practiceActions'
import {useSession} from '../../network/worldClient'
import '../../ai-park/residentSeatInvite.css'

export function NpcArrivalPanel(){
 const practice=useCompanions(s=>s.practice),pending=useCompanions(s=>s.practicePending),error=useCompanions(s=>s.practiceError)
 const connected=useSession(s=>s.status==='connected')
 if(practice?.phase!=='ARRIVING')return null
 return <section className="npc-arrival-panel" role="region" aria-label="오목 상대 입장">
  <strong>{practice.name}이 자리에 앉고 있어요.</strong>
  <p role="status">테이블 옆에서 잠깐 걸어온 뒤 대결을 시작해요. 참가비는 0냥이에요.</p>
  {error&&<p role="alert">{error}</p>}
  <button disabled={pending||!connected} onClick={()=>void practiceAction('stop')}>호출 취소</button>
 </section>
}
