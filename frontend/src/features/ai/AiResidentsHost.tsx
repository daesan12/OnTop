import {useEffect} from 'react'
import {useSession} from '../../network/worldClient'
import {parkRuntime} from '../../park/runtime/runtime'
import {CompanionPanel} from '../../ai-park/CompanionPanel'
import {acceptAiFeatures,LOCAL_AI_FIXTURE,resetAiFeatures,useAiFeatures} from './serviceFeatures'

export function AiResidentsHost(){
 const connected=useSession(s=>s.status==='connected'),channel=useSession(s=>s.roomId)
 const enabled=useAiFeatures(s=>s.companions)
 useEffect(()=>{
  resetAiFeatures();if(LOCAL_AI_FIXTURE||!connected||!channel)return
  let active=true,timer:ReturnType<typeof setTimeout>
  const load=async()=>{try{const value=await parkRuntime.requestJSON('/api/v1/ai/features');if(active)acceptAiFeatures(value)}catch{/* Preserve an active game during a transient capability request failure. */}finally{if(active)timer=setTimeout(()=>void load(),30000)}}
  void load();return()=>{active=false;clearTimeout(timer);resetAiFeatures()}
 },[connected,channel])
 return !LOCAL_AI_FIXTURE&&enabled?<CompanionPanel/>:null
}
