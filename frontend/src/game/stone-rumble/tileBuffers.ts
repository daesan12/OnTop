import type { InstancedBufferAttribute } from 'three'
import type { StoneTile } from './protocol'

/** 준비용 상대 시각→실경기 epoch 전환과 다음 경기/장시간 관전도 작은 float32 범위로 유지한다. */
export const stoneTileEpoch = (time: number) => Math.floor(time / 3_600_000) * 3_600_000

/** 고정 격자의 위치/색은 유지하고, 변경된 밟음 여부·붕괴 시각만 GPU에 전달한다. 시각 진행은 uniform이다. */
export function updateStoneTileMarks(marks: InstancedBufferAttribute, tiles: readonly StoneTile[], epoch = 0) {
  let changed = 0
  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index]!, stepped = Number(tile.stepped), deadline = Math.fround((tile.breakAt - epoch) / 1000)
    if (marks.getX(index) === stepped && marks.getY(index) === deadline) continue
    marks.setXY(index, stepped, deadline)
    marks.addUpdateRange(index * 2, 2)
    changed++
  }
  if (changed) marks.needsUpdate = true
  return changed
}
