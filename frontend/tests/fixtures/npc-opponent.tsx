import {useGame} from '../../src/game/store'
import {GamePanel} from '../../src/game/GamePanel'
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
import {practiceAction} from '../../src/ai-park/practiceActions'
import '../../src/styles.css'
useSession.setState({sessionId:'101',status:'connected',roomId:'fixture-channel',tableId:'table1',seatIndex:0})
acceptAiFeatures({companions:true,jokeContest:false})
parkRuntime.requestJSON=async(path,init)=>{
 const response=await fetch(path,init),body=await response.json()
 if(!response.ok)throw new RestError(response.status,body.code,body.message)
 return body
}
function Fixture(){const game=useDisplayGame(s=>s.game);return <main className="park-page" style={{padding:30,color:'#293f32',background:'#f5ecd5',minHeight:'100vh'}}>
 <h1>테이블별 NPC 입장 검수</h1><p>진입 상태 표시용 로컬 화면 · 실제 계정과 지갑은 사용하지 않습니다.</p>
 <output aria-label="오목판 연결 상태">{game?.gameId??'대결 입장 대기'}</output>
 <output aria-label="검수용 착수 수">{game?.omok?.moveCount??0}</output>
 <button onClick={()=>void practiceAction('place',{x:7,y:7})}>검수용 흑돌 착수</button>
 <button onClick={()=>useGame.setState({start:{tableId:'table1',revision:1,phase:'STARTING',startAttemptId:'human',gameCode:'OMOK',gameSessionId:null,code:null,simulation:false}})}>사람과 새 판 검수</button><button onClick={()=>useGame.setState({start:null})}>새 판 상태 해제</button><ResidentSeatInvite disabled={false}/><CompanionPanel/><NpcArrivalPanel/><GamePanel/>
 </main>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
