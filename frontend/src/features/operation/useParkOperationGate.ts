import { useEffect, useRef, useState } from 'react'
import {
  loadServiceOperation,
  unavailableServiceOperation,
  type ServiceOperationStatus,
} from './serviceOperation'

export const PARK_OPERATION_POLL_MS = 5_000
export const PARK_OPERATION_FAILURE_LIMIT = 3

export const operationPollUnavailable = (consecutiveFailures: number) =>
  consecutiveFailures >= PARK_OPERATION_FAILURE_LIMIT

export function operationRedirect(
  status: ServiceOperationStatus,
  gameplayActive: boolean,
): ServiceOperationStatus | null {
  return status.mode === 'NORMAL' || gameplayActive ? null : status
}

/** 공원 체류 중 운영 상태를 감시하고, 진행 중 판의 정산이 끝난 뒤 점검 화면으로 전환한다. */
export function useParkOperationGate(
  gameplayActive: boolean,
  onBlocked: (status: ServiceOperationStatus) => void,
) {
  const [blocked, setBlocked] = useState<ServiceOperationStatus | null>(null)
  const failures = useRef(0)

  useEffect(() => {
    const redirect = blocked && operationRedirect(blocked, gameplayActive)
    if (redirect) onBlocked(redirect)
  }, [blocked, gameplayActive, onBlocked])

  useEffect(() => {
    let disposed = false
    let pending = false
    const controller = new AbortController()
    const check = async () => {
      if (disposed || pending) return
      pending = true
      try {
        const status = await loadServiceOperation(controller.signal)
        if (!disposed) {
          failures.current = 0
          setBlocked(status.mode === 'NORMAL' ? null : status)
        }
      } catch {
        if (!disposed && operationPollUnavailable(++failures.current)) {
          setBlocked(current => current ?? unavailableServiceOperation())
        }
      } finally {
        pending = false
      }
    }
    const checkVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const interval = window.setInterval(check, PARK_OPERATION_POLL_MS)
    window.addEventListener('focus', checkVisible)
    document.addEventListener('visibilitychange', checkVisible)
    void check()
    return () => {
      disposed = true
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', checkVisible)
      document.removeEventListener('visibilitychange', checkVisible)
    }
  }, [])
}
