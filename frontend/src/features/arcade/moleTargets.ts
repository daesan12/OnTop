import { record } from '../../network/protocol'

/** 이전 서버·로컬 프리뷰는 ID 없이 타격을 제출한다. */
export function playableMoleTargetIds(targets: unknown, holes: number, roundId: string): ReadonlyMap<number, string> {
  const ids = new Map<number, string>()
  if (!Array.isArray(targets)) return ids
  // Java MoleTargets와 동일한 FNV-1a 32비트 해시. 판 ID를 정수로 변환하면 BIGINT 정밀도를 잃을 수 있다.
  let selection = 0x811c9dc5
  for (let i = 0; i < roundId.length; i++) {
    selection = Math.imul(selection ^ roundId.charCodeAt(i), 0x01000193)
  }
  for (const target of targets) {
    if (!record(target) || !Array.isArray(target.ids) || target.ids.length !== 2) continue
    const hole = target.hole
    if (typeof hole === 'number' && Number.isInteger(hole) && hole >= 0 && hole < holes) {
      const id = target.ids[(selection >>> hole) & 1]
      if (typeof id === 'string' && id.length > 0) ids.set(hole, id)
    }
  }
  return ids
}
