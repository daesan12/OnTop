import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResidentLoadQueue } from '../../src/features/ai/residentLoadQueue'
import { EntryStages } from '../../park-renewal-preview/live/entryStages'

afterEach(() => vi.useRealTimers())

describe('공원 입장 작업 순서', () => {
  it('주민은 가까운 순서로 하나씩 준비하고 작업 사이에 메인 스레드를 양보한다', async () => {
    vi.useFakeTimers()
    const queue = new ResidentLoadQueue(), calls: string[] = []
    let finish!: () => void
    queue.enqueue(async () => { calls.push('far') }, () => 100)
    queue.enqueue(async () => { calls.push('near'); await new Promise<void>(resolve => { finish = resolve }) }, () => 1)
    await vi.runOnlyPendingTimersAsync()
    expect(calls).toEqual(['near'])
    finish(); await Promise.resolve(); await Promise.resolve()
    expect(calls).toEqual(['near'])
    await vi.runAllTimersAsync()
    expect(calls).toEqual(['near', 'far'])
  })

  it('취소된 주민은 다운로드하지 않고 이동한 거리와 실패를 다음 작업에 반영한다', async () => {
    vi.useFakeTimers()
    const queue = new ResidentLoadQueue(), calls: string[] = []
    let distance = 100
    queue.enqueue(async () => { calls.push('moved'); throw Error('asset failed') }, () => distance)
    queue.enqueue(async () => { calls.push('other') }, () => 10)
    const cancel = queue.enqueue(async () => { calls.push('cancelled') }, () => 0)
    distance = 1; cancel()
    await vi.runAllTimersAsync()
    expect(calls).toEqual(['moved', 'other'])
  })

  it('첫 화면 전에는 원거리 단계를 시작하지 않고 커밋마다 렌더 한 번을 기다린다', () => {
    const queue = new EntryStages(8, 0)
    queue.commit(0, 0)
    for (let frame = 1; frame <= 100; frame++) expect(queue.next(0, false, frame * 20, .02)).toBe(0)
    expect(queue.next(0, true, 2020, .02)).toBe(1)
    expect(queue.next(0, true, 2040, .02)).toBe(0)
    queue.commit(1, 2040)
    expect(queue.next(1, true, 2200, .16)).toBe(1)
    expect(queue.next(1, true, 2400, .2)).toBe(1)
    expect(queue.next(1, true, 2600, .2)).toBe(2)
  })

  it('5 FPS에서도 단계가 멈추거나 동시에 여러 묶음을 생성하지 않는다', () => {
    const queue = new EntryStages(8, 0)
    let stage = 0
    queue.commit(stage, 0)
    for (let now = 200; now <= 4800; now += 200) {
      const next = queue.next(stage, true, now, .2)
      expect(next - stage).toBeLessThanOrEqual(1)
      if (next !== stage) { stage = next; queue.commit(stage, now) }
    }
    expect(stage).toBe(8)
  })

  it('느린 생성 프레임 뒤에는 연속된 정상 프레임을 확보한 후 다음 묶음을 시작한다', () => {
    const queue = new EntryStages(8, 1)
    queue.commit(1, 0)
    expect(queue.next(1, true, 200, .2)).toBe(1)
    expect(queue.next(1, true, 216, .016)).toBe(1)
    expect(queue.next(1, true, 232, .016)).toBe(1)
    expect(queue.next(1, true, 248, .016)).toBe(2)
  })
})
