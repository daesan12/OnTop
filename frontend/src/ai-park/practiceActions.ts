import {companionPath} from '../features/ai/serviceFeatures'
import {parkRuntime} from '../park/runtime/runtime'
import {useSession} from '../network/worldClient'
import {useCompanions,acceptCompanions} from '../features/ai/companions'
import {useDisplayGame,canPlaceDisplayed} from '../game/displayGame'

export async function refreshPractice() {
 const id=useDisplayGame.getState().localPractice?.snapshot.gameId
 if(!id)return
 try {
  const status=await parkRuntime.requestJSON(companionPath('status'))
  if(useDisplayGame.getState().localPractice?.snapshot.gameId===id)acceptCompanions(status)
 }catch {useCompanions.setState({practiceError:'연결 상태를 확인한 뒤 다시 시도해주세요.'})}
}

export async function practiceAction(kind:string,extra:Record<string,number>={}) {
 const s=useCompanions.getState(),g=s.practice?.snapshot??useDisplayGame.getState().localPractice?.snapshot
 if(!g||s.practicePending||useSession.getState().status!=='connected')return
 if(kind==='place'&&!canPlaceDisplayed(useSession.getState().sessionId,extra.x,extra.y))return
 useCompanions.setState({practicePending:true,practiceError:''})
 try {
  const result=await parkRuntime.requestJSON(companionPath('action'),{method:'POST',body:JSON.stringify({kind,gameId:g.gameId,version:g.version,actionId:crypto.randomUUID(),...extra})})
  if(useCompanions.getState().practice?.snapshot.gameId!==g.gameId)return
  const status=await parkRuntime.requestJSON(companionPath('status'))
  if(useCompanions.getState().practice?.snapshot.gameId!==g.gameId)return
  acceptCompanions(status)
  if(result&&typeof result==='object'&&'message'in result)useCompanions.setState({practiceError:String(result.message)})
 }catch {if(useCompanions.getState().practice?.snapshot.gameId===g.gameId)useCompanions.setState({practiceError:'처리하지 못했어요. 최신 판과 연결 상태를 확인해주세요.'})}
 finally {useCompanions.setState({practicePending:false})}
}
