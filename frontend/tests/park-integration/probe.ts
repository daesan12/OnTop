import {_roots} from '@react-three/fiber'
import {Vector3} from 'three'
import {useSession,avatars} from '../../src/network/worldClient'
import {parkRuntime} from '../../src/park/runtime/runtime'
import {useFacilityState} from '../../src/features/facilities/state'
import {getParkInteraction} from '../../src/features/interactions/parkInteraction'
export function probe(){
 const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene,s=useSession.getState()
 return {identity:scene.getObjectByName('park-service-map')?.userData,session:s,pose:avatars.get(s.sessionId)?.current,swimming:avatars.get(s.sessionId)?.swimming,facilities:useFacilityState.getState().ready,target:getParkInteraction(),tables:Array.from({length:16},(_,n)=>({id:'table-'+(n+1),position:scene.getObjectByName('table-'+(n+1))?.getWorldPosition(new Vector3()).toArray()})),mailbox:scene.getObjectByName('feedback-mailbox')?.getWorldPosition(new Vector3()).toArray()}
}
export const inspect=(id:string)=>parkRuntime.inspectTable(id)
