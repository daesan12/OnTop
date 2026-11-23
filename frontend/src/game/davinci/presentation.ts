import { create } from 'zustand'
import { estimatedServerTime } from '../../network/serverEventClock'
import type { DavinciState } from './protocol'

export const OPENING_MS = 4200
export const useSecretTileUI = create<{
  selection: { gameId: string; userId: string; tileId: string; version: number } | null
  pick(gameId: string, version: number, userId: string, tileId: string): void
}>(set => ({ selection: null, pick: (gameId, version, userId, tileId) => set({ selection: { gameId, version, userId, tileId } }) }))

export function openingElapsed(state: DavinciState, now = estimatedServerTime()) {
  return state.openingStartedAt ? Math.max(0, now - Date.parse(state.openingStartedAt)) : OPENING_MS
}

export function openingActive(state: DavinciState, now?: number) {
  return state.stage === 'SETUP' && openingElapsed(state, now) < OPENING_MS
}

/** 섞는 동안에는 색만 사용한다. 숫자·덱 순서를 궤적이나 난수 시드에 넣지 않는다. */
export function openingPose(index: number, elapsed: number) {
  const t = Math.min(1, Math.max(0, elapsed / 3000)), angle = index * 2.39996 + t * Math.PI * 5
  const radius = .65 + (index % 5) * .19
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius * .65,
    y: .2 + Math.sin(t * Math.PI) * (.16 + (index % 3) * .06), yaw: angle + Math.sin(t * 12 + index) * .7 }
}
