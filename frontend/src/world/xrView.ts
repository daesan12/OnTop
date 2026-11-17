import { Vector3, type Camera } from 'three'

/** XR owns only presentation/input; position reports remain the existing park runtime's job. */
export const parkXRView = { ownsInput: false, active: false, position: new Vector3() }
export const PARK_XR_CROWD_THRESHOLD = 20
export const cameraWorldPosition = (camera: Camera): Vector3 => parkXRView.active ? parkXRView.position : camera.position
