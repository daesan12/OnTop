import { integer, record } from '../../network/protocol'

export const FITNESS_REWARD_STATUS_PATH = '/api/v1/world/fitness/rewards/status'
export interface FitnessRewardStatus {
  enabled: boolean; earningsDate: string; todayEarned: number; dailyCap: number
  rewardIntervalSeconds: number; serverNow: number; nextRewardAt: number | null; activeLeaseId: string | null
}
export function parseFitnessRewardStatus(value: unknown): FitnessRewardStatus {
  if (!record(value) || typeof value.enabled !== 'boolean' || typeof value.earningsDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.earningsDate) || !integer(value.todayEarned) || value.dailyCap !== 300
    || value.rewardIntervalSeconds !== 60 || !integer(value.serverNow)
    || !(value.nextRewardAt === null || integer(value.nextRewardAt))
    || !(value.activeLeaseId === null || typeof value.activeLeaseId === 'string' && value.activeLeaseId.length > 0 && value.activeLeaseId.length <= 128)
    || value.nextRewardAt !== null && (!value.enabled || value.activeLeaseId === null || value.todayEarned >= value.dailyCap))
    throw new Error('운동 수입 정보를 다시 확인해주세요.')
  return value as unknown as FitnessRewardStatus
}
export const fitnessRewardDate = (now: number) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10)
export function fitnessRewardSeconds(status: FitnessRewardStatus, elapsedMs: number) {
  return status.nextRewardAt === null ? null : Math.max(0, Math.ceil((status.nextRewardAt - status.serverNow - elapsedMs) / 1000))
}
