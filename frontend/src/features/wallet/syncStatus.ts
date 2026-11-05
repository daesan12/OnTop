import { create } from 'zustand'

export type BalanceError = 'not-ready' | 'unavailable' | 'failed' | null
/** 공원 루트의 동기화 상태. HUD를 다시 열어도 조회를 새로 만들지 않는다. */
export const useWalletSyncStatus = create(() => ({ owner: '', loading: false, error: null as BalanceError }))
