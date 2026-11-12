import { findParkRoute, type NavPoint } from './parkNavigation'
import { EXPECTED_MAP_VERSION } from '../../park/mapConfig'

export interface RouteWork { id: number; start: NavPoint; end: NavPoint; mapVersion: string }
export interface RouteResult { id: number; path?: NavPoint[] | null; durationMs?: number; error?: string; mapVersion: string }
export type RouteWorkerMessage = RouteResult | { ready: true }
const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<RouteWork>) => void) | null; postMessage: (result: RouteWorkerMessage) => void }
scope.onmessage = ({data}) => {
  try {
    if (data.mapVersion !== EXPECTED_MAP_VERSION) throw new Error('지도 버전이 일치하지 않습니다.')
    const began = performance.now(), path = findParkRoute(data.start, data.end)
    scope.postMessage({id:data.id,path,durationMs:performance.now()-began,mapVersion:EXPECTED_MAP_VERSION})
  } catch {
    scope.postMessage({id:data.id,error:'경로를 계산하지 못했습니다.',mapVersion:EXPECTED_MAP_VERSION})
  }
}
scope.postMessage({ready:true})
