import { randomUUID } from 'node:crypto'

/** RawWS contract simulation only; it does not implement server movement/physics. */
export function followFixture(emit: (type: string, payload: object, requestId?: string | null) => void, userId: string) {
  let version = 0, links: { followId: string; followerId: string; targetId: string }[] = []
  let mode: 'normal' | 'hold' | 'reject' | 'lost' = 'normal', failCheck = false
  let held: { requestId: string; version: number; links: typeof links } | undefined
  const state = (requestId: string | null = null) => emit('WORLD_FOLLOW_STATE', { channelId: 'fixture-channel', version, links }, requestId)
  return {
    state, links: () => structuredClone(links), mode: (value: typeof mode) => { mode = value },
    failCheck: (value: boolean) => { failCheck = value },
    release: () => { if (links.length) { links = []; version++; state() } },
    disconnect: () => { links = []; version = 0 },
    late: () => { if (held) emit('WORLD_FOLLOW_STATE', { channelId: 'fixture-channel', version: held.version, links: held.links }, held.requestId) },
    push: (patch: object) => emit('WORLD_FOLLOW_STATE', { channelId: 'fixture-channel', version, links, ...patch }),
    handle: (type: string, payload: Record<string, unknown>, requestId: string) => {
      if (!['WORLD_FOLLOW_CHECK', 'WORLD_FOLLOW_START', 'WORLD_FOLLOW_STOP'].includes(type)) return false
      if (type === 'WORLD_FOLLOW_CHECK') {
        if (failCheck) emit('ERROR', { code: 'NOT_IN_CHANNEL', message: '채널을 확인해주세요.' }, requestId)
        else state(requestId)
        return true
      }
      if (mode === 'reject') { emit('ERROR', { code: 'FOLLOW_OUT_OF_RANGE', message: '가까운 이용자를 선택해주세요.' }, requestId); return true }
      if (type === 'WORLD_FOLLOW_START') {
        if (links[0]?.targetId !== payload.targetId) { links = [{ followId: randomUUID(), followerId: userId, targetId: String(payload.targetId) }]; version++ }
      } else {
        if (links[0]?.followId !== payload.followId) { emit('ERROR', { code: 'FOLLOW_LINK_MISMATCH', message: '관계가 변경되었어요.' }, requestId); return true }
        links = []; version++
      }
      if (mode === 'hold') held = { requestId, version, links: structuredClone(links) }
      else if (mode !== 'lost') state(requestId)
      return true
    },
  }
}
