export type ServiceOperationMode = 'NORMAL' | 'DRAINING' | 'MAINTENANCE'

export interface ServiceOperationStatus {
  mode: ServiceOperationMode
  notice: string
  maintenanceStartedAt: string | null
  expectedOpenAt: string | null
  version: number
  updatedAt: string
  serverTime: string
}

const modes = new Set<ServiceOperationMode>(['NORMAL', 'DRAINING', 'MAINTENANCE'])

export async function loadServiceOperation(signal?: AbortSignal): Promise<ServiceOperationStatus> {
  const response = await fetch('/api/v1/operations/status', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('운영 상태를 확인하지 못했습니다.')
  const value: unknown = await response.json().catch(() => null)
  if (!value || typeof value !== 'object') throw new Error('운영 상태 응답을 확인하지 못했습니다.')
  const candidate = value as Partial<ServiceOperationStatus>
  if (!modes.has(candidate.mode as ServiceOperationMode) || typeof candidate.notice !== 'string'
    || typeof candidate.version !== 'number' || typeof candidate.updatedAt !== 'string'
    || typeof candidate.serverTime !== 'string'
    || candidate.maintenanceStartedAt !== null && typeof candidate.maintenanceStartedAt !== 'string'
    || candidate.expectedOpenAt !== null && typeof candidate.expectedOpenAt !== 'string') {
    throw new Error('운영 상태 응답을 확인하지 못했습니다.')
  }
  return candidate as ServiceOperationStatus
}

export function unavailableServiceOperation(): ServiceOperationStatus {
  const now = new Date().toISOString()
  return {
    mode: 'MAINTENANCE',
    notice: '더 안정적인 공원을 준비하고 있어요. 잠시 후 다시 확인해주세요.',
    maintenanceStartedAt: null,
    expectedOpenAt: null,
    version: 0,
    updatedAt: now,
    serverTime: now,
  }
}
