import {companionPath} from '../features/ai/serviceFeatures'
import {useEffect} from 'react'
import {parkRuntime} from '../park/runtime/runtime'
import {useSession} from '../network/worldClient'
import {useCompanions,acceptCompanions,resetCompanionActors} from '../features/ai/companions'
import {observedNpcPractice,syncPracticeSpectator} from '../features/ai/practiceSpectator'

/** Keep resident/game state synchronized; entry points live at the NPC and table seat. */
export function CompanionPanel(){
 const room=useSession(s=>s.roomId),table=useSession(s=>s.tableId),own=useSession(s=>s.sessionId)
 useEffect(()=>{useCompanions.setState({finishedPractice:null})},[table,own,room])
 const connected=useSession(s=>s.status==='connected'),channel=useSession(s=>s.roomId)
 useEffect(()=>{if(!connected||!channel){resetCompanionActors();useCompanions.setState({practice:null,finishedPractice:null,observedPractice:null,practiceChat:null,practicePending:false,practiceError:'',reply:'',waitSeconds:-1});return}
  let active=true,timer:ReturnType<typeof setTimeout>
  const failure='주민 상태를 확인하지 못했어요. 다시 연결하고 있어요.'
  const poll=async()=>{try{const value=await parkRuntime.requestJSON(companionPath('status'));if(active){const previousGameId=observedNpcPractice()?.snapshot.gameId;if(acceptCompanions(value)){if(syncPracticeSpectator(previousGameId)==='ended')void parkRuntime.unwatchGame();if(useCompanions.getState().practiceError===failure)useCompanions.setState({practiceError:''})}}}catch{if(active)useCompanions.setState({practiceError:failure})}finally{if(active)timer=setTimeout(()=>void poll(),650)}}
  void poll();return()=>{active=false;clearTimeout(timer)}
 },[connected,channel])
 return null
}
