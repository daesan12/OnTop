// Real arrival/polling UI and display store; requests are isolated by the browser test.
import {createRoot} from 'react-dom/client'
import {CompanionPanel} from '../../src/ai-park/CompanionPanel'
import {ResidentSeatInvite} from '../../src/ai-park/ResidentSeatInvite'
import {NpcArrivalPanel} from '../../src/features/ai/NpcArrivalPanel'
import {acceptAiFeatures} from '../../src/features/ai/serviceFeatures'
import {useDisplayGame} from '../../src/game/displayGame'
import {useSession} from '../../src/network/worldClient'
import {parkRuntime} from '../../src/park/runtime/runtime'
import {RestError} from '../../src/network/restError'
import '../../src/styles.css'
useSession.setState({sessionId:'101',status:'connected',roomId:'fixture-channel',tableId:'table1',seatIndex:0})
acceptAiFeatures({companions:true,jokeContest:false})
parkRuntime.requestJSON=async(path,init)=>{
 const response=await fetch(path,init),body=await response.json()
 if(!response.ok)throw new RestError(response.status,body.code,body.message)
 return body
}
function Fixture(){const game=useDisplayGame(s=>s.game);return <main style={{padding:30,color:'#293f32',background:'#f5ecd5',minHeight:'100vh'}}>
 <h1>테이블별 NPC 입장 검수</h1><p>진입 상태 표시용 로컬 화면 · 실제 계정과 지갑은 사용하지 않습니다.</p>
 <output aria-label="오목판 연결 상태">{game?.gameId??'대결 입장 대기'}</output>
 <ResidentSeatInvite disabled={false}/><CompanionPanel/><NpcArrivalPanel/>
 </main>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
