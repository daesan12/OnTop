import { parkRuntime } from '../../park/runtime/runtime'
import { BALLOON_FARE } from './flight'

const requestKeyPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const pendingKey = (owner: string) => `ontop:balloon:pending-payment:${owner}`

export class BalloonFareError extends Error {}

export async function buyBalloonTicket(owner: string) {
  const key = pendingKey(owner)
  let requestId: string
  try {
    const saved = sessionStorage.getItem(key)
    requestId = saved && requestKeyPattern.test(saved) ? saved : crypto.randomUUID()
    // Keep this key until the paid ride starts, including after a lost response or page refresh.
    sessionStorage.setItem(key, requestId)
  } catch {
    throw new BalloonFareError('결제에 필요한 브라우저 저장 공간을 확인해 주세요.')
  }
  let response: unknown
  try {
    response = await parkRuntime.requestJSON('/api/v1/world/balloon/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
    if (code === 'INSUFFICIENT_COINS') throw new BalloonFareError(`엽전이 부족해요. ${BALLOON_FARE}냥이 필요해요.`)
    if (code === 'BALLOON_STATION_REQUIRED') throw new BalloonFareError('하늘언덕 승강장으로 이동한 뒤 다시 시도해 주세요.')
    if (code === 'WALLET_NOT_READY') throw new BalloonFareError('지갑을 확인한 뒤 다시 시도해 주세요.')
    throw new BalloonFareError('결제 결과를 확인하지 못했어요. 같은 요청으로 다시 시도할 수 있어요.')
  }
  if (typeof response !== 'object' || response === null || !('requestId' in response) || response.requestId !== requestId
    || !('fee' in response) || response.fee !== BALLOON_FARE) {
    throw new BalloonFareError('결제 내역을 확인하지 못했어요. 다시 시도해 주세요.')
  }
  return requestId
}

export function completeBalloonTicket(owner: string, requestId: string) {
  const key = pendingKey(owner)
  if (sessionStorage.getItem(key) === requestId) sessionStorage.removeItem(key)
}
