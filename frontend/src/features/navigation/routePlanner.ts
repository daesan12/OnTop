import { EXPECTED_MAP_VERSION } from '../../park/mapConfig'
import type { NavPoint } from './parkNavigation'
import type { RouteResult, RouteWork } from './navigation.worker'

type Port = Pick<Worker,'onmessage'|'onerror'|'postMessage'|'terminate'>
const makeWorker = ():Port => new Worker(new URL('./navigation.worker.ts',import.meta.url),{type:'module',name:'ontop-local-navigation'})
/** One worker for one selected destination. Closing/cancelling releases its grid
 * caches; no stale reply can update a different destination, account or channel.
 */
export function createRoutePlanner(factory:()=>Port=makeWorker) {
  let worker:Port|undefined, next=0, disposed=false
  const pending=new Map<number,{resolve:(result:{path:NavPoint[]|null;durationMs:number})=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  function fail(message:string) {
    disposed=true
    if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();worker=undefined}
    for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error(message))}
    pending.clear()
  }
  return {
    plan(start:NavPoint,end:NavPoint):Promise<{path:NavPoint[]|null;durationMs:number}> {
      if(disposed)return Promise.reject(new Error('길 안내 계산이 종료되었습니다.'))
      if(pending.size)return Promise.reject(new Error('이미 경로를 계산하고 있습니다.'))
      return new Promise((resolve,reject)=>{
        try {
          if(!worker){
            worker=factory()
            worker.onmessage=({data}:MessageEvent<RouteResult>)=>{
              const request=pending.get(data.id)
              if(!request)return
              clearTimeout(request.timer);pending.delete(data.id)
              if(data.error||data.mapVersion!==EXPECTED_MAP_VERSION||data.path===undefined){request.reject(new Error('길 안내를 준비하지 못했습니다.'));return}
              request.resolve({path:data.path,durationMs:data.durationMs??0})
            }
            worker.onerror=event=>{event.preventDefault();fail('길 안내를 준비하지 못했습니다.')}
          }
          const id=++next
          pending.set(id,{resolve,reject,timer:setTimeout(()=>fail('길 안내 계산 시간이 초과되었습니다.'),5000)})
          const request:RouteWork={id,start:{...start},end:{...end},mapVersion:EXPECTED_MAP_VERSION}
          worker.postMessage(request)
        } catch { fail('길 안내를 준비하지 못했습니다.');reject(new Error('길 안내를 준비하지 못했습니다.')) }
      })
    },
    dispose:()=>fail('길 안내 계산이 취소되었습니다.'),
  }
}
