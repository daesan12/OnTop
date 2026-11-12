import {useCompanions,type Practice} from './companions'
import {residentsEnabled,useAiFeatures} from './serviceFeatures'
import {useSession} from '../../network/worldClient'
import {useGame} from '../../game/store'
import {displayedGame} from '../../game/displayGame'
import {gatheringModel} from '../tableLobby/gatheringModel'
import {TabletResult} from '../tableLobby/TableGatheringHud'
import {practiceAction} from '../../ai-park/practiceActions'
import {useParkRuntime} from '../../park/runtime/ParkRuntime'
import {useEffect,useState} from 'react'
import {gameState} from '../../game/protocol'

const productionActive=()=>{
 const g=useGame.getState(),s=useSession.getState()
 return !!(g.game&&gameState(g.game).status!=='FINISHED')
  ||!!(g.start?.tableId===s.tableId&&g.start&&['STARTING','CONFIRMED','PLAYING','SETTLING'].includes(g.start.phase))
}
export function getNpcResult(){
 const state=useCompanions.getState(),p=state.practice??state.finishedPractice,s=useSession.getState()
 return !productionActive()&&residentsEnabled()&&s.status==='connected'&&s.seatIndex>=0&&p?.snapshot.endedAt&&p.snapshot.tableId===s.tableId
  &&[p.snapshot.blackUserId,p.snapshot.whiteUserId].some(id=>String(id)===s.sessionId)?p:null
}

export function useNpcResult(){
 const practice=useCompanions(s=>s.practice),finished=useCompanions(s=>s.finishedPractice)
 useSession(s=>s.tableId);useSession(s=>s.sessionId);useSession(s=>s.status);useSession(s=>s.seatIndex)
 useGame(s=>s.game);useGame(s=>s.start)
 useAiFeatures(s=>s.companions)
 const active=productionActive()
 useEffect(()=>{
  // A status poll started before the human game may finish after it starts.
  if(active&&(finished||practice?.snapshot.endedAt))useCompanions.setState({
   finishedPractice:null,...(practice?.snapshot.endedAt?{practice:null}:{}),
  })
 },[active,finished,practice])
 return getNpcResult()
}

// Presentation only: NPC results never become wallet settlements or production Result messages.
export function npcResultModel(p:Practice,own:string,nickname:string){
 const s=p.snapshot,ids=[String(s.blackUserId),String(s.whiteUserId)]
 const table={tableId:s.tableId,version:s.version,capacity:2,minimumPlayers:2,allReady:false,selectorUserId:own,
  gameCode:'OMOK',targetScore:null,betAmountPerPlayer:0,seats:ids.map((userId,i)=>({seatNumber:i+1,userId,ready:false}))}
 const model=gatheringModel({table,ownId:own,game:displayedGame(useGame.getState(),p,performance.now()).game,
  result:null,start:null,nickname:id=>id===own?nickname:p.name})
 return {...model,settled:true,canReturn:true,settlement:'주민과의 대결 · 엽전 변동 없음',
  rows:model.rows.map(row=>({...row,label:!s.winnerUserId?'무승부':row.winner?'승리':'패배'}))}
}

export async function dismissNpcResult(gameId:string){
 const state=useCompanions.getState(),session=useSession.getState()
 if(state.practicePending||session.status!=='connected'||productionActive())return false
 const p=state.practice??state.finishedPractice
 if(p?.snapshot.gameId!==gameId||!p.snapshot.endedAt||p.snapshot.tableId!==session.tableId
  ||![p.snapshot.blackUserId,p.snapshot.whiteUserId].some(id=>String(id)===session.sessionId))return false
 if(state.practice){
  await practiceAction('stop')
  // Keep the result and error visible when the stop or confirming status request failed.
  if(useCompanions.getState().practice)return false
 }
 const current=useSession.getState()
 if(current.status!=='connected'||current.sessionId!==session.sessionId||current.roomId!==session.roomId
  ||current.tableId!==session.tableId||productionActive())return false
 if(useCompanions.getState().finishedPractice?.snapshot.gameId===gameId)
  useCompanions.setState({finishedPractice:null,practiceError:''})
 return true
}

export async function leaveNpcResult(gameId:string,leaveTable:()=>Promise<boolean>){
 const session=useSession.getState(),p=getNpcResult()
 if(p?.snapshot.gameId!==gameId||useCompanions.getState().practicePending)return false
 const sameSeat=()=>{
  const current=useSession.getState()
  return current.status==='connected'&&current.sessionId===session.sessionId&&current.roomId===session.roomId&&current.tableId===session.tableId
 }
 let left=false
 try {left=await leaveTable()}catch { /* Preserve the result until the server confirms TABLE_LEFT. */ }
 if(!left){
  if(sameSeat())useCompanions.setState({practiceError:'자리에서 일어나지 못했어요. 연결 상태를 확인한 뒤 다시 눌러주세요.'})
  return false
 }
 const current=useSession.getState(),state=useCompanions.getState()
 if(current.sessionId!==session.sessionId||current.roomId!==session.roomId||current.tableId)return false
 useCompanions.setState({
  ...(state.practice?.snapshot.gameId===gameId?{practice:null}:{}),
  ...(state.finishedPractice?.snapshot.gameId===gameId?{finishedPractice:null}:{}),practiceError:'',
 })
 return true
}

export function NpcResultPanel({practice}:{practice:Practice}){
 const runtime=useParkRuntime(),own=useSession(s=>s.sessionId),nickname=useSession(s=>s.profiles[s.sessionId]?.nickname??'나')
 const pending=useCompanions(s=>s.practicePending),error=useCompanions(s=>s.practiceError)
 const [leaving,setLeaving]=useState(false)
 const leave=async()=>{if(leaving)return;setLeaving(true);try{await leaveNpcResult(practice.snapshot.gameId,()=>runtime.leaveTable())}finally{setLeaving(false)}}
 return <TabletResult key={practice.snapshot.gameId} model={npcResultModel(practice,own,nickname)}
  actions={{pending:pending||leaving,error,onReturn:()=>void dismissNpcResult(practice.snapshot.gameId),onLeave:()=>void leave()}}/>
}
