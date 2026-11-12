import {companionPath} from '../features/ai/serviceFeatures'
import {useEffect} from 'react'
import {parkRuntime} from '../park/runtime/runtime'
import {useSession} from '../network/worldClient'
import {useCompanions,acceptCompanions,resetCompanionActors} from '../features/ai/companions'

/** Keep resident/game state synchronized; entry points live at the NPC and table seat. */
export function CompanionPanel(){
 const connected=useSession(s=>s.status==='connected'),channel=useSession(s=>s.roomId)
 useEffect(()=>{if(!connected||!channel){resetCompanionActors();useCompanions.setState({practice:null,observedPractice:null,practiceChat:null,practicePending:false,practiceError:'',reply:'',waitSeconds:-1});return}
  let active=true,timer:ReturnType<typeof setTimeout>
  const poll=async()=>{try{const value=await parkRuntime.requestJSON(companionPath('status'));if(active)acceptCompanions(value)}catch{if(active)useCompanions.setState({practice:null,observedPractice:null,practiceChat:null})}finally{if(active)timer=setTimeout(()=>void poll(),650)}}
  void poll();return()=>{active=false;clearTimeout(timer)}
 },[connected,channel])
 return null
}
