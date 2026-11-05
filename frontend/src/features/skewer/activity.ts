import { create } from 'zustand'
import type { Phase } from './game'

interface SkewerActivityState {
  solo: boolean
  cooperative: boolean
}

export const useSkewerActivity = create<SkewerActivityState>(() => ({
  solo: false,
  cooperative: false,
}))

export const setSoloSkewerActivity = (active: boolean) => useSkewerActivity.setState({ solo: active })
export const setCooperativeSkewerActivity = (active: boolean) =>
  useSkewerActivity.setState({ cooperative: active })

export const soloSkewerGameplayActive = (phase: Phase, starting: boolean) =>
  starting || !['ready', 'finished'].includes(phase)

/** 대기방은 아직 진행 중인 판이 아니므로 배출 시 즉시 점검 화면으로 전환한다. */
export const cooperativeSkewerGameplayActive = (phase?: string) =>
  !!phase && !['WAITING', 'FINISHED'].includes(phase)
