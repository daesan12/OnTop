import { afterEach, beforeEach, expect, it } from 'vitest'
import { avatars, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { followAvailability, requestFollow } from '../../src/features/follow/controller'
import { acceptFollowState, resetFollow, useFollow } from '../../src/features/follow/state'
import { followService, type FollowService } from '../../src/features/follow/service'
import { createPreviewFollowService } from '../../src/features/follow/previewService'

const scope = { userId: '101', channelId: 'a' }
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
beforeEach(() => {
  resetWorld(); resetFollow()
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', capacity: 16, currentUsers: 2, userIds: ['101', '102'], version: 1 })
  emit('WORLD_STATE', { channelId: 'a', version: 1, mapVersion: EXPECTED_MAP_VERSION, avatars: ['101', '102'].map((userId, i) => ({ userId,
    position: { x: i * 4, y: .8, z: 0, yaw: 0, moving: false, running: false, swimming: false, lastInputSeq: 0 } })) })
})
afterEach(() => { resetWorld(); resetFollow() })
it('keeps release follow unavailable until a real BE contract is installed', async () => {
  expect(followService.mode).toBe('unavailable')
  expect(await requestFollow('102')).toBe(false)
  expect(useFollow.getState().links).toEqual([])
  expect(useFollow.getState().error).toContain('서버 연결')
})
it('checks prototype range, height and activity before making a request', () => {
  expect(followAvailability('102')).toBe(''); expect(followAvailability('101')).not.toBe('')
  const remote = avatars.get('102')!
  remote.current.x = 13; expect(followAvailability('102')).toContain('가까이')
  remote.current.x = 4; remote.current.y = 4; expect(followAvailability('102')).toContain('가까이')
  remote.current.y = .8; remote.seatIndex = 0; expect(followAvailability('102')).toContain('산책')
})
it('waits for approval, rejects duplicate clicks, and never changes authoritative positions', async () => {
  let approve!: (value: { followerId: string; targetId: string }[]) => void
  const service: FollowService = { ...createPreviewFollowService(), start: () => new Promise(resolve => { approve = resolve }) }
  const before = { ...avatars.get('101')!.current }, pending = requestFollow('102', service)
  expect(useFollow.getState()).toMatchObject({ pending: true, links: [] })
  expect(await requestFollow('102', service)).toBe(false)
  approve([{ followerId: '101', targetId: '102' }]); expect(await pending).toBe(true)
  expect(useFollow.getState().links).toEqual([{ followerId: '101', targetId: '102' }])
  expect(avatars.get('101')!.current).toEqual(before)
  expect(await requestFollow(null, service)).toBe(true); expect(useFollow.getState().links).toEqual([])
})
it('keeps a rejected stop from falsely clearing the approved relationship', async () => {
  acceptFollowState(scope, [{ followerId: '101', targetId: '102' }])
  const service: FollowService = { ...createPreviewFollowService(), stop: async () => { throw new Error('종료 승인 실패') } }
  expect(await requestFollow(null, service)).toBe(false)
  expect(useFollow.getState().links).toHaveLength(1)
})
it('rejects an acknowledgement that does not actually approve the requested relationship', async () => {
  expect(await requestFollow('102', { ...createPreviewFollowService(), start: async () => [] })).toBe(false)
  expect(useFollow.getState().links).toEqual([])
})
it('honors a server approval after the target moves beyond the initial selection distance', async () => {
  let approve!: (value: { followerId: string; targetId: string }[]) => void
  const pending = requestFollow('102', { ...createPreviewFollowService(), start: () => new Promise(resolve => { approve = resolve }) })
  avatars.get('102')!.current.x = 13
  approve([{ followerId: '101', targetId: '102' }])
  expect(await pending).toBe(true)
  expect(useFollow.getState().links).toEqual([{ followerId: '101', targetId: '102' }])
})
it('ignores a delayed approval after a channel change and aborts all pending scope state', async () => {
  let approve!: (value: { followerId: string; targetId: string }[]) => void
  const pending = requestFollow('102', { ...createPreviewFollowService(), start: () => new Promise(resolve => { approve = resolve }) })
  resetWorld('reconnecting'); approve([{ followerId: '101', targetId: '102' }])
  expect(await pending).toBe(false); expect(useFollow.getState()).toMatchObject({ links: [], pending: false })
  expect(useSession.getState().status).toBe('reconnecting')
})
it('rejects invalid public link sets without partially applying them', () => {
  expect(acceptFollowState(scope, [{ followerId: '101', targetId: '101' }])).toBe(false)
  expect(acceptFollowState(scope, [{ followerId: '101', targetId: '102' }, { followerId: '101', targetId: '103' }])).toBe(false)
  expect(useFollow.getState().links).toEqual([])
})
