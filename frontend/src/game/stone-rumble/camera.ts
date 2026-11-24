import { followStoneYaw } from './motion'

export const STONE_CAMERA_PITCH = .46
export const STONE_CAMERA_MIN_PITCH = .18
export const STONE_CAMERA_MAX_PITCH = 1.35
export const STONE_CAMERA_DISTANCE = 10.5
const SENSITIVITY = .003

export function createStoneCamera() {
  return { yaw: 0, renderedYaw: 0, pitch: STONE_CAMERA_PITCH, renderedPitch: STONE_CAMERA_PITCH, zoom: 1 }
}
export type StoneCameraState = ReturnType<typeof createStoneCamera>

export function turnStoneCamera(camera: StoneCameraState, dx: number, dy: number) {
  camera.yaw = (camera.yaw - dx * SENSITIVITY) % (2 * Math.PI)
  camera.pitch = Math.max(STONE_CAMERA_MIN_PITCH, Math.min(STONE_CAMERA_MAX_PITCH, camera.pitch + dy * SENSITIVITY))
}

export function advanceStoneCamera(camera: StoneCameraState, delta: number) {
  const dt = Math.min(.05, Math.max(0, delta))
  camera.renderedYaw = followStoneYaw(camera.renderedYaw, camera.yaw, dt, 32, 12)
  camera.renderedPitch += (camera.pitch - camera.renderedPitch) * (1 - Math.exp(-dt * 32))
}

/** 누르고 있는 키도 현재 화면 방향을 따른다. 이동 자체는 카메라를 회전시키지 않는다. */
export function stoneMovement(x: number, z: number, yaw: number) {
  const length = Math.hypot(x, z)
  if (!length) return { x: 0, z: 0 }
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  return { x: (x * cos + z * sin) / length, z: (z * cos - x * sin) / length }
}
