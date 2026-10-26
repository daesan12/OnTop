import { beforeEach, describe, expect, it } from 'vitest'
import { emoteSector, emoteSlots, parseEmoteBindings } from '../../src/features/emotes/catalog'
import { EmoteTimeline, parseEmoteEvent, parseEmoteCancellation } from '../../src/features/emotes/timeline'
import { emoteUnavailable } from '../../src/features/emotes/availability'
import { useEmoteState } from '../../src/features/emotes/state'
import { avatars, cancelAvatarEmote, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const now = Date.now()
const event = (patch: Record<string, unknown> = {}) => ({ eventId: 'event-1', channelId: 'a', userId: '102',
  emoteCode: 'WAVE', sentAt: new Date(now - 500).toISOString(), ...patch })
const position = { x: 0, y: 0.8, z: 34, yaw: 0, moving: false, running: false, swimming: false, lastInputSeq: 0 }
const emit = (type: string, payload: Record<string, unknown>, requestId: string | null = null) => receive({ type, payload, requestId })
const world = (version: number, moving = false) => emit('WORLD_STATE', { channelId: 'a', version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: ['101', '102'].map(userId => ({ userId, position: { ...position, moving } })) })
beforeEach(() => {
  resetWorld()
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  useEmoteState.setState({ bindings: { EMOTE_WAVE: 'WAVE', EMOTE_CLAP: 'CLAP' } })
  world(1)
})

describe('emote catalog and server-time playback', () => {
  it('keeps five authored options and three empty sectors without flip/handshake aliases', () => {
    expect(emoteSlots.filter(Boolean)).toHaveLength(5)
    expect(emoteSlots.filter(slot => !slot)).toHaveLength(3)
    expect(emoteSector(0, -133)).toBe(0)
    expect(emoteSector(133, 0)).toBe(2)
    expect(emoteSector(0, 0)).toBe(-1)
    expect(emoteSector(0, 230)).toBe(-1)
    expect(parseEmoteBindings(undefined)).toEqual({})
    expect(parseEmoteBindings([{ motion: 'EMOTE_WAVE', code: 'WAVE' }])).toEqual({ EMOTE_WAVE: 'WAVE' })
    for (const value of [null, {}, [null], [{ motion: 'EMOTE_TABLE_FLIP', code: 'FLIP' }],
      [{ motion: 'EMOTE_WAVE', code: 'wave' }], [{ motion: 'EMOTE_WAVE', code: 'WAVE' }, { motion: 'EMOTE_CLAP', code: 'WAVE' }]])
      expect(() => parseEmoteBindings(value)).toThrow()
    expect(() => parseEmoteEvent(event({ sentAt: 'bad' }))).toThrow()
  })

  it('uses the approved start timestamp once, rejects old/out-of-order events, and retains dedup across reconnect', () => {
    const timeline = new EmoteTimeline(), e = parseEmoteEvent(event())
    expect(timeline.accept(e, 'EMOTE_WAVE', now)).toEqual({ motion: 'EMOTE_WAVE', at: now - 500, readyAt: now + 4500 })
    expect(timeline.accept(e, 'EMOTE_WAVE', now + 10)).toBeNull()
    expect(timeline.accept({ ...e, eventId: 'older', sentAt: new Date(now - 600).toISOString() }, 'EMOTE_WAVE', now)).toBeNull()
    timeline.clearChannel()
    expect(timeline.accept(e, 'EMOTE_WAVE', now + 20)).toBeNull()
    expect(timeline.accept({ ...e, eventId: 'expired', sentAt: new Date(now - 5000).toISOString() }, 'EMOTE_WAVE', now)).toBeNull()
    expect(timeline.accept({ ...e, eventId: 'future', sentAt: new Date(now + 60_000).toISOString() }, 'EMOTE_WAVE', now)).toBeNull()
  })

  it('prevents a delayed approval from replaying an interrupted action', () => {
    const timeline = new EmoteTimeline(), e = parseEmoteEvent(event())
    timeline.cancel(e.userId, now - 300)
    expect(timeline.accept(e, 'EMOTE_WAVE', now)).toBeNull()
    expect(timeline.accept({ ...e, eventId: 'new', sentAt: new Date(now).toISOString() }, 'EMOTE_WAVE', now)).not.toBeNull()
  })

  it('maps only configured codes, preserves the event timestamp on a snapshot, and ignores wrong channels/users', () => {
    const e = event({ eventId: 'render-1' })
    emit('WORLD_EMOTE_EVENT', { ...e, channelId: 'b' })
    emit('WORLD_EMOTE_EVENT', { ...e, emoteCode: 'UNMAPPED' })
    emit('WORLD_EMOTE_EVENT', { ...e, userId: 'missing' })
    expect(avatars.get('102')!.emote).toBe('')
    emit('WORLD_EMOTE_EVENT', e)
    expect(avatars.get('102')!.emoteAt).toBe(Date.parse(e.sentAt))
    world(2)
    emit('WORLD_EMOTE_EVENT', e)
    expect(avatars.get('102')!.emoteAt).toBe(Date.parse(e.sentAt))
    world(3, true)
    expect(avatars.get('102')!.emote).toBe('')
  })

  it('requires the exact own pending acknowledgement, preserves cooldown after cancel and keeps neutral snapshots harmless', () => {
    const e = event({ eventId: 'own-1', userId: '101' })
    emit('WORLD_EMOTE_EVENT', e, 'unknown')
    expect(avatars.get('101')!.emote).toBe('')
    useEmoteState.setState({ pending: true, requestId: 'mine', requested: 'EMOTE_WAVE' })
    emit('WORLD_EMOTE_EVENT', e, 'wrong')
    expect(avatars.get('101')!.emote).toBe('')
    emit('WORLD_EMOTE_EVENT', e, 'mine')
    const readyAt = useEmoteState.getState().readyAt
    expect(avatars.get('101')!.emote).toBe('EMOTE_WAVE')
    world(2)
    expect(avatars.get('101')!.emote).toBe('EMOTE_WAVE')
    cancelAvatarEmote('101')
    expect(useEmoteState.getState().readyAt).toBe(readyAt)
    expect(avatars.get('101')!.emote).toBe('')
    emit('WORLD_EMOTE_EVENT', { ...e, eventId: 'cancelled-approval', sentAt: new Date().toISOString() }, 'mine')
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState().readyAt).toBeGreaterThanOrEqual(readyAt)
    const previousCooldown = useEmoteState.getState().readyAt
    emit('CHANNEL_LEFT', { channelId: 'a' })
    expect(useEmoteState.getState().pending).toBe(false)
    expect(useEmoteState.getState().readyAt).toBe(previousCooldown)
    expect(useSession.getState().roomId).toBe('')
  })

  it('does not revive a pending own expression after the server removes and restores that avatar', () => {
    useEmoteState.setState({ pending: true, requestId: 'removed', requested: 'EMOTE_WAVE' })
    emit('WORLD_STATE', { channelId: 'a', version: 2, mapVersion: EXPECTED_MAP_VERSION,
      avatars: [{ userId: '102', position }] })
    expect(useEmoteState.getState().cancelled).toBe(true)
    world(3)
    emit('WORLD_EMOTE_EVENT', event({ eventId: 'late-after-removal', userId: '101', sentAt: new Date().toISOString() }), 'removed')
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState().readyAt).toBeGreaterThan(Date.now())
  })

  it.each(['MOVEMENT', 'ACTIVITY_STARTED', 'CHANNEL_LEFT', 'DISCONNECTED'])('cancels the matching server event for %s while retaining cooldown', reason => {
    const e = event({ eventId: `own-cancel-${reason}`, userId: '101', sentAt: new Date().toISOString() })
    useEmoteState.setState({ pending: true, requestId: 'mine', requested: 'EMOTE_WAVE' })
    emit('WORLD_EMOTE_EVENT', e, 'mine')
    const cooldown = useEmoteState.getState().readyAt
    const cancellation = { eventId: `cancel-${reason}`, emoteEventId: e.eventId, channelId: 'a', userId: '101', reason, sentAt: e.sentAt }
    emit('WORLD_EMOTE_CANCELLED', { ...cancellation, emoteEventId: 'different' })
    emit('WORLD_EMOTE_CANCELLED', { ...cancellation, channelId: 'other' })
    emit('WORLD_EMOTE_CANCELLED', { ...cancellation, userId: '102' })
    expect(avatars.get('101')!.emote).toBe('EMOTE_WAVE')
    emit('WORLD_EMOTE_CANCELLED', cancellation); emit('WORLD_EMOTE_CANCELLED', cancellation)
    expect(avatars.get('101')!.emote).toBe('')
    expect(useEmoteState.getState()).toMatchObject({ readyAt: cooldown, cancelled: true })
  })

  it('ignores cancellation of an old/expired event and accepts a fresh event after cancellation despite network delay', () => {
    const timeline = new EmoteTimeline(), old = parseEmoteEvent(event({ eventId: 'old' }))
    const newer = { ...old, eventId: 'new', sentAt: new Date(now - 100).toISOString() }
    const cancellation = parseEmoteCancellation({ eventId: 'cancel-new', emoteEventId: 'new', channelId: 'a', userId: '102', reason: 'MOVEMENT', sentAt: new Date(now).toISOString() })
    timeline.accept(old, 'EMOTE_WAVE', now); timeline.accept(newer, 'EMOTE_CLAP', now)
    expect(timeline.cancelEvent({ ...cancellation, emoteEventId: 'old' }, now)).toBe(false)
    expect(timeline.cancelEvent(cancellation, now)).toBe(true)
    expect(timeline.cancelEvent(cancellation, now)).toBe(false)
    expect(timeline.accept({ ...newer, eventId: 'next', sentAt: new Date(now - 50).toISOString() }, 'EMOTE_WAVE', now)).not.toBeNull()
    expect(timeline.cancelEvent({ ...cancellation, eventId: 'late', emoteEventId: 'next' }, now + 10_000)).toBe(false)
    expect(() => parseEmoteCancellation({ ...cancellation, reason: 'UNKNOWN' })).toThrow()
    expect(() => parseEmoteCancellation({ ...cancellation, sentAt: 'invalid' })).toThrow()
  })

  it('does not cut off a newer remote animation when the previous cancellation arrives late', () => {
    const time = Date.now(), first = event({ eventId: 'remote-old', sentAt: new Date(time - 500).toISOString() })
    emit('WORLD_EMOTE_EVENT', first)
    emit('WORLD_EMOTE_CANCELLED', { eventId: 'remote-stop', emoteEventId: first.eventId, channelId: 'a', userId: '102', reason: 'MOVEMENT', sentAt: new Date(time - 300).toISOString() })
    expect(avatars.get('102')!.emote).toBe('')
    emit('WORLD_EMOTE_EVENT', event({ eventId: 'remote-next', sentAt: new Date(time - 100).toISOString() }))
    expect(avatars.get('102')!.emote).toBe('EMOTE_WAVE')
    emit('WORLD_EMOTE_CANCELLED', { eventId: 'remote-late', emoteEventId: first.eventId, channelId: 'a', userId: '102', reason: 'MOVEMENT', sentAt: new Date(time).toISOString() })
    expect(avatars.get('102')!.emote).toBe('EMOTE_WAVE')
  })

  it('blocks seated emotes and ignores delayed approvals while seated', () => {
    avatars.get('101')!.seatIndex = 0; useEmoteState.setState({ readyAt: 0 })
    expect(emoteUnavailable('EMOTE_WAVE')).toContain('시설')
    avatars.get('102')!.seatIndex = 0
    emit('WORLD_EMOTE_EVENT', event({ eventId: 'seated-delayed', sentAt: new Date().toISOString() }))
    expect(avatars.get('102')!.emote).toBe('')
  })
})
