/** 첫 입장 환영 비행. 건너뛰기 없이 이 시간만 보여 준다. */
export const WELCOME_FLIGHT_MS = 5000

export interface Point3 { x: number; y: number; z: number }
export interface CameraPose { position: Point3; look: Point3 }

/** 비행 중 차례로 보여 주는 즐길 거리. 경로가 내 위치마다 달라 특정 장소 이름은 쓰지 않는다. at은 비행 진행률(0~1)이다. */
export const FLIGHT_CAPTIONS = [
  { at: 0, text: '함께 하는 보드게임 한 판' },
  { at: 0.34, text: '혼자 즐기는 미니게임' },
  { at: 0.67, text: '걷고 쉬며 이웃 만나기' },
] as const

export const flightCaption = (t: number) => [...FLIGHT_CAPTIONS].reverse().find(c => t >= c.at)!.text

const smooth = (from: number, to: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - from) / (to - from)))
  return k * k * (3 - 2 * k)
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mixPoint = (a: Point3, b: Point3, k: number): Point3 => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), z: mix(a.z, b.z, k) })

/** CameraRig가 매 프레임 읽는 비행 상태. React 상태로 바꾸지 않는다. */
export const welcomeFlight = { active: false, startedAt: 0 }

/**
 * 공원 상공을 크게 돌며 내려와, 끝에서는 평소 3인칭 시점(end)과 정확히 겹친다.
 * 회전은 내 캐릭터 쪽 방위에서 끝나도록 거꾸로 잡아 마지막 합류가 짧다.
 */
export function welcomeFlightPose(progress: number, end: CameraPose, parkSize: number): CameraPose {
  const t = Math.min(1, Math.max(0, progress))
  const sweep = Math.PI * 0.75
  const finish = Math.atan2(end.position.x, end.position.z)
  const angle = finish - sweep * (1 - t)
  const radius = mix(parkSize * 0.85, parkSize * 0.35, t), height = mix(parkSize * 0.62, parkSize * 0.2, t)
  const orbit = { x: Math.sin(angle) * radius, y: height, z: Math.cos(angle) * radius }
  return {
    position: mixPoint(orbit, end.position, smooth(0.55, 1, t)),
    look: mixPoint({ x: 0, y: 4, z: 0 }, end.look, smooth(0.45, 1, t)),
  }
}
