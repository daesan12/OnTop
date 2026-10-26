import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAMERA, TELESCOPE, TELESCOPES, telescopeFov } from '../../src/park/mapConfig'
import { canReachTelescope, normalizeTelescopeAim, telescopeAnchors } from '../../src/features/telescopes/anchors'
import { aimTelescope, enterTelescope, leaveTelescope } from '../../src/features/telescopes/controller'
import { MockTelescopeService } from '../../src/features/telescopes/mock/MockTelescopeService'
import { telescopeService } from '../../src/features/telescopes/service'
import { telescopeSignal, useTelescopeState } from '../../src/features/telescopes/state'
import { telescopeView, zoomTelescope } from '../../src/features/telescopeView'
import { avatars, authoritativePose, clearChannel, receive, refreshActivityPresentation, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { inputState, roamingInput } from '../../src/world/inputOwnership'
import { interactionAim } from '../../src/features/interactions/interactionAim'
import { getParkInteraction } from '../../src/features/interactions/parkInteraction'
import { useFitnessState } from '../../src/features/fitness/state'

vi.mock('../../src/features/telescopes/service', async () => {
  const { MockTelescopeService } = await import('../../src/features/telescopes/mock/MockTelescopeService')
  return { telescopeService: new MockTelescopeService() }
})
const t = TELESCOPES[0]!, other = TELESCOPES[1]!, near = telescopeAnchors(t.id).use
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
function world(version = 1, position = near, users = ['101', '102'], mapVersion = EXPECTED_MAP_VERSION) {
  emit('WORLD_STATE', { channelId: 'a', version, mapVersion, avatars: users.map(userId => ({ userId,
    position: { ...position, lastInputSeq: 0, moving: false, running: false, swimming: false } })) })
}
beforeEach(() => {
  vi.useFakeTimers()
  resetWorld()
  interactionAim.ready = false
  roamingInput.ready = true
  for (const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key] = false
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  world()
})
afterEach(() => { vi.restoreAllMocks(); resetWorld(); roamingInput.ready = false; vi.useRealTimers() })
const finish = async <T>(pending: Promise<T>) => { await vi.advanceTimersByTimeAsync(200); return pending }

describe('M06 telescope access, approval and lifetimes', () => {
  it('uses two existing summit anchors and rejects the same x/z on the ground or invalid coordinates', () => {
    expect(TELESCOPES).toHaveLength(2)
    for (const instrument of TELESCOPES) {
      expect(canReachTelescope(telescopeAnchors(instrument.id).use, instrument.id)).toBe(true)
      expect(canReachTelescope({ ...telescopeAnchors(instrument.id).use, y: 0.8 }, instrument.id)).toBe(false)
    }
    expect(canReachTelescope({ ...near, x: NaN }, t.id)).toBe(false)
    expect(canReachTelescope(near, 'missing')).toBe(false)
    expect(normalizeTelescopeAim(5 * Math.PI, 20).pitch).toBe(TELESCOPE.maxPitch)
    expect(() => normalizeTelescopeAim(Infinity, 0)).toThrow('방향')
  })
  it('atomically grants one owner per instrument/channel, allows the second instrument and frees aborted grants', async () => {
    const service = new MockTelescopeService(), a = new AbortController(), b = new AbortController(), c = new AbortController(), d = new AbortController()
    const context = { userId: '101', channelId: 'a', position: near }
    const first = service.enter(context, t.id, a.signal)
    const second = service.enter({ ...context, userId: '102' }, t.id, b.signal)
    const rejection = expect(second).rejects.toThrow('먼저 이용')
    await vi.advanceTimersByTimeAsync(200)
    const lease = await first
    await rejection
    const independent = await finish(service.enter({ ...context, userId: '102', position: telescopeAnchors(other.id).use }, other.id, c.signal))
    expect(independent.telescopeId).toBe(other.id)
    await finish(service.enter({ ...context, channelId: 'b' }, t.id, d.signal))
    a.abort()
    const replacement = await finish(service.enter({ ...context, userId: '103' }, t.id, b.signal))
    expect(replacement.grantId).not.toBe(lease.grantId)
    const stale = expect(service.aim(lease, { yaw: 1, pitch: 0 }, d.signal)).rejects.toThrow('상태가 변경')
    await vi.advanceTimersByTimeAsync(50)
    await stale
    b.abort(); c.abort(); d.abort()
  })
  it('uses the shared E target, waits for approval and preserves the actual approach through enter/leave', async () => {
    expect(getParkInteraction()).toMatchObject({ kind: 'telescope', id: t.id, occupied: false })
    const actual = authoritativePose('101')
    const request = enterTelescope(t.id)
    expect(useTelescopeState.getState().pending).toBe(true)
    expect(useSession.getState().telescopeId).toBe('')
    expect(await enterTelescope(other.id)).toBe(false)
    expect(await finish(request)).toBe(true)
    expect(telescopeView).toMatchObject({ id: t.id, zoom: 3, yaw: t.yaw })
    world(2)
    expect(useSession.getState().telescopeId).toBe(t.id)
    expect(authoritativePose('101')).toEqual(actual)
    expect(await finish(leaveTelescope())).toBe(true)
    expect(avatars.get('101')!.current).toEqual(actual)
    expect(telescopeView.id).toBe('')
  })
  it('throttles approved direction to 100ms, keeps immediate view/zoom local and never commits a late aim after leave', async () => {
    await finish(enterTelescope(t.id))
    const send = vi.spyOn(telescopeService, 'aim')
    const originalYaw = avatars.get('101')!.telescopeYaw
    telescopeView.yaw = 1
    zoomTelescope(20)
    expect(telescopeView.zoom).toBe(8)
    expect(telescopeFov(CAMERA.fov, telescopeView.zoom)).toBeLessThan(telescopeFov(CAMERA.fov, 3))
    const aiming = aimTelescope()
    expect(avatars.get('101')!.telescopeYaw).toBe(originalYaw)
    expect(await aimTelescope(2, 0)).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(await aiming).toBe(true)
    expect(avatars.get('101')!.telescopeYaw).toBeCloseTo(1)
    expect(await aimTelescope(2, 0)).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
    expect(Object.keys(send.mock.calls[0]![1]).sort()).toEqual(['pitch', 'yaw'])
    await vi.advanceTimersByTimeAsync(50)
    const late = aimTelescope(2, 0), leaving = leaveTelescope()
    await vi.advanceTimersByTimeAsync(200)
    expect(await late).toBe(false)
    expect(await leaving).toBe(true)
    expect(avatars.get('101')!.telescopeId).toBe('')
    zoomTelescope(-100)
    expect(telescopeView.zoom).toBe(2)
  })
  it('rechecks actual height after a delayed grant and releases the invalid lease', async () => {
    const pending = enterTelescope(t.id)
    world(2, { ...near, y: 0.8 })
    expect(await finish(pending)).toBe(false)
    expect(useTelescopeState.getState().placements).toEqual({})
    expect(useTelescopeState.getState().error).toContain('위치나 이용 상태')
    await finish(telescopeService.enter({ channelId: 'a', userId: '102', position: near }, t.id, telescopeSignal('102')))
  })
  it('preserves use on leave failure, permits retry and rejects pending responses across disconnect/map/channel changes', async () => {
    await finish(enterTelescope(t.id))
    vi.spyOn(telescopeService, 'leave').mockRejectedValueOnce(new Error('반납 실패'))
    expect(await leaveTelescope()).toBe(false)
    expect(useSession.getState().telescopeId).toBe(t.id)
    expect(useTelescopeState.getState().error).toBe('반납 실패')
    expect(await finish(leaveTelescope())).toBe(true)
    for (const reset of [() => world(5, near, ['101', '102'], 'different'), () => resetWorld('reconnecting'), clearChannel]) {
      useSession.setState({ status: 'connected', roomId: 'a', mapCompatible: true })
      world(4)
      const pending = enterTelescope(t.id)
      reset()
      expect(await finish(pending)).toBe(false)
      expect(useTelescopeState.getState()).toMatchObject({ placements: {}, pending: false })
      expect(telescopeView.id).toBe('')
    }
  })
  it('shows a remote approved owner/direction and frees only the departed instrument', async () => {
    const lease = await finish(telescopeService.enter({ channelId: 'a', userId: '102', position: near }, t.id, telescopeSignal('102')))
    useTelescopeState.setState({ placements: { '102': { ...lease, yaw: 0.5, pitch: -0.3 } } })
    refreshActivityPresentation()
    expect(getParkInteraction()).toMatchObject({ kind: 'telescope', occupied: true, occupant: '산책자 102' })
    expect(avatars.get('102')).toMatchObject({ telescopeId: t.id, telescopeYaw: 0.5, telescopePitch: -0.3 })
    world(2, telescopeAnchors(other.id).use)
    await finish(enterTelescope(other.id))
    world(3, telescopeAnchors(other.id).use, ['101'])
    expect(useSession.getState().telescopeId).toBe(other.id)
    expect(Object.keys(useTelescopeState.getState().placements)).toEqual(['101'])
  })
  it('blocks entry/aim while another facility or panel owns input', async () => {
    useFitnessState.setState({ pending: true })
    expect(await enterTelescope(t.id)).toBe(false)
    useFitnessState.setState({ pending: false })
    for (const flag of ['chatOpen', 'manualOpen', 'mapOpen', 'emoteWheelOpen', 'minigameOpen'] as const) {
      inputState[flag] = true
      expect(await enterTelescope(t.id)).toBe(false)
      expect(getParkInteraction()).toBeNull()
      inputState[flag] = false
    }
    await finish(enterTelescope(t.id))
    inputState.manualOpen = true
    expect(await aimTelescope(1, 0)).toBe(false)
  })

  it('drops an in-flight aim when the own avatar disappears and never restores use after reentry', async () => {
    expect(await finish(enterTelescope(t.id))).toBe(true)
    const pending = aimTelescope(0.7, -0.4)
    world(2, near, ['102'])
    expect(useTelescopeState.getState().placements).toEqual({})
    expect(telescopeView.id).toBe('')
    expect(await finish(pending)).toBe(false)
    world(3)
    expect(useSession.getState().telescopeId).toBe('')
    expect(avatars.get('101')!.telescopeId).toBe('')
  })
})
