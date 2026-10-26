import {_roots} from '@react-three/fiber'
import {Vector3} from 'three'
export function parkLiveProbe(){
  const scene=_roots.get(document.querySelector('canvas')!)!.store.getState().scene
  return {identity:scene.getObjectByName('park-service-map')!.userData,
    table:scene.getObjectByName('table-1')!.getWorldPosition(new Vector3()).toArray(),
    mailbox:scene.getObjectByName('feedback-mailbox')!.getWorldPosition(new Vector3()).toArray()}
}
