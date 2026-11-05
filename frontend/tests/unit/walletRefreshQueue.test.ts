import { afterEach, expect, test, vi } from 'vitest'
import { createWalletRefreshQueue } from '../../src/features/wallet/refreshQueue'

afterEach(() => vi.useRealTimers())

test('같은 시점의 예약·정산 알림은 조회 한 번으로 합친다', async () => {
  vi.useFakeTimers()
  const read = vi.fn(async () => {})
  const queue = createWalletRefreshQueue(read, vi.fn())
  queue.request(); queue.request(); queue.request()
  await vi.advanceTimersByTimeAsync(25)
  expect(read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1000)
  expect(read).toHaveBeenCalledTimes(1)
  queue.dispose()
})

test('진행 중 정산 알림은 낡은 요청을 한 번 취소하고 후속 조회 한 번으로 확인한다', async () => {
  vi.useFakeTimers()
  let finish!: () => void
  const accepted: boolean[] = []
  const read = vi.fn(async (current: () => boolean) => {
    await new Promise<void>(resolve => { finish = resolve })
    accepted.push(current())
  })
  const cancel = vi.fn()
  const queue = createWalletRefreshQueue(read, cancel)
  queue.request()
  await vi.advanceTimersByTimeAsync(25)
  queue.request(); queue.request(); queue.request()
  await vi.advanceTimersByTimeAsync(100)
  expect(read).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalledTimes(1)
  finish()
  await vi.advanceTimersByTimeAsync(25)
  expect(accepted).toEqual([false])
  expect(read).toHaveBeenCalledTimes(2)
  finish()
  await vi.advanceTimersByTimeAsync(1000)
  expect(accepted).toEqual([false, true])
  expect(read).toHaveBeenCalledTimes(2)
  queue.dispose()
})

test('공원 종료는 예약된 조회와 늦은 응답 및 후속 조회를 모두 무효화한다', async () => {
  vi.useFakeTimers()
  const skipped = vi.fn(async () => {})
  const pending = createWalletRefreshQueue(skipped, vi.fn())
  pending.request(); pending.dispose()
  await vi.advanceTimersByTimeAsync(100)
  expect(skipped).not.toHaveBeenCalled()
  let finish!: () => void, accepted = true
  const read = vi.fn(async (current: () => boolean) => {
    await new Promise<void>(resolve => { finish = resolve })
    accepted = current()
  })
  const queue = createWalletRefreshQueue(read, vi.fn())
  queue.request()
  await vi.advanceTimersByTimeAsync(25)
  queue.request(); queue.dispose(); finish()
  await vi.advanceTimersByTimeAsync(1000)
  expect(accepted).toBe(false)
  expect(read).toHaveBeenCalledTimes(1)
})
