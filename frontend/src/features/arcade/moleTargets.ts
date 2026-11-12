import { record } from '../../network/protocol'

/** 이전 서버·로컬 프리뷰는 ID 없이 타격을 제출한다. */
export function visibleMoleTargetIds(targets: unknown, holes: number): ReadonlyMap<number, string> {
  const ids = new Map<number, string>()
  if (!Array.isArray(targets)) return ids
  for (const target of targets) {
    if (!record(target) || target.visible !== true || typeof target.id !== 'string') continue
    const hole = target.hole
    if (typeof hole === 'number' && Number.isInteger(hole) && hole >= 0 && hole < holes) {
      ids.set(hole, target.id)
    }
  }
  return ids
}
