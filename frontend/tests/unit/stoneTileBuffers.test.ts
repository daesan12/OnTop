import { expect, it } from 'vitest'
import { InstancedBufferAttribute } from 'three'
import { stoneTileEpoch, updateStoneTileMarks } from '../../src/game/stone-rumble/tileBuffers'
import type { StoneTile } from '../../src/game/stone-rumble/protocol'

const tiles = (): StoneTile[] => Array.from({ length: 169 }, (_, id) => ({ id, floor: 2, q: id % 13 - 6, r: Math.floor(id / 13) - 6, stepped: false, breakAt: 1000000000 }))
it('시간/동일 스냅샷 갱신은 GPU 버퍼를 다시 전송하지 않고 바뀐 발판의 두 값만 전달한다', () => {
  const state = tiles(), marks = new InstancedBufferAttribute(new Float32Array(state.length * 2), 2)
  expect(updateStoneTileMarks(marks, state)).toBe(169)
  marks.clearUpdateRanges(); const version = marks.version
  expect(updateStoneTileMarks(marks, structuredClone(state))).toBe(0)
  expect(marks.version).toBe(version); expect(marks.updateRanges).toEqual([])
  state[83] = { ...state[83]!, stepped: true, breakAt: 6250 }
  expect(updateStoneTileMarks(marks, state)).toBe(1)
  expect(marks.updateRanges).toEqual([{ start: 166, count: 2 }])
  expect(marks.getX(83)).toBe(1); expect(marks.getY(83)).toBe(6.25)
})
it('소수 초의 float32 오차는 재전송을 일으키지 않으며 다음 경기의 발판은 초기화한다', () => {
  const state = tiles(), marks = new InstancedBufferAttribute(new Float32Array(state.length * 2), 2)
  state[0]!.breakAt = 10021; state[0]!.stepped = true
  updateStoneTileMarks(marks, state); marks.clearUpdateRanges()
  const version = marks.version
  expect(updateStoneTileMarks(marks, state)).toBe(0); expect(marks.version).toBe(version)
  expect(updateStoneTileMarks(marks, tiles())).toBe(1)
  expect(marks.getX(0)).toBe(0)
})
it('실제 epoch 밀리초에서도 기준점을 뺀 1.2초 지연과 0.65초 낙하를 구분한다', () => {
  const epoch = 1794078900000, state = tiles(), marks = new InstancedBufferAttribute(new Float32Array(state.length * 2), 2)
  state[0]!.stepped = true; state[0]!.breakAt = epoch + 1200
  updateStoneTileMarks(marks, state, epoch)
  expect(marks.getY(0)).toBeCloseTo(1.2, 6)
  const at = (ms: number) => Math.fround(ms / 1000) - marks.getY(0)
  expect(at(1000)).toBeLessThan(0)
  expect(at(1500)).toBeCloseTo(.3, 6)
  expect(at(1900)).toBeGreaterThan(.65)
})
it('준비용 상대 시각에서 실경기와 다음 시간대로 바뀌어도 붕괴까지 남은 시간을 유지한다', () => {
  const state = tiles(), marks = new InstancedBufferAttribute(new Float32Array(state.length * 2), 2)
  for (const time of [1000, 1794078900000, 1794086100000]) {
    const epoch = stoneTileEpoch(time)
    state[0]!.breakAt = time + 1200
    updateStoneTileMarks(marks, state, epoch)
    expect(marks.getY(0) - Math.fround((time - epoch) / 1000)).toBeCloseTo(1.2, 3)
  }
})
