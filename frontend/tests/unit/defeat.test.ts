import { describe, expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { characterSource } from '../fixtures/characterRig'
import { DefeatTimeline, parseGameReaction, type DefeatReaction } from '../../src/game/presentation/defeat'
import { createCharacterRig } from '../../src/world/art/CharacterRig'
import { createAvatarMotion } from '../../src/world/avatarMotion'
import { sampleDefeatMotion } from '../../src/world/art/defeatMotion'
import type { AvatarSnapshot } from '../../src/network/worldClient'

const now = Date.parse('2026-10-27T08:00:00Z')
const event = (patch: Record<string, unknown> = {}) => parseGameReaction({ eventId: 'g:reaction:101',
  gameId: 'g', tableId: 'table', channelId: 'channel', gameCode: 'LIAR_BRIDGE', version: 7,
  userId: '101', kind: 'FORFEIT', remainingBefore: 3, motion: 'head-clutch', durationMs: 3600,
  occurredAt: new Date(now - 500).toISOString(), ...patch })
const position = { x: 1, y: .8, z: 2 }

describe('server-confirmed reaction events', () => {
  it('reserves table-flip for an originally two-player explicit forfeit, keeping normal loss and narrowed multiplayer games calm', () => {
    const duel=event({participantCount:2,remainingBefore:2,kind:'FORFEIT',motion:'table-flip',durationMs:2800})
    expect(new DefeatTimeline().accept(duel,'table-1',position,now)?.kind).toBe('table-flip')
    for(const patch of [{participantCount:2,kind:'DEFEAT'},{participantCount:4,kind:'FORFEIT'}]){
      const calm=event({...patch,remainingBefore:2,motion:'head-clutch',durationMs:3600})
      expect(new DefeatTimeline().accept(calm,'table-1',position,now)?.kind).toBe('head-clutch')
      expect(()=>event({...calm,motion:'table-flip',durationMs:2800})).toThrow()
    }
  })
  it.each([1, 2, 3, 4])('validates the authoritative motion for %i remaining participants', remainingBefore => {
    const motion = remainingBefore === 2 ? 'table-flip' : 'head-clutch'
    const e = event({ remainingBefore, motion, durationMs: motion === 'table-flip' ? 2800 : 3600 })
    const t = new DefeatTimeline()
    expect(t.accept(e, 'table-1', position, now)).toMatchObject({ kind: motion, at: now - 500, key: e.eventId })
  })
  it('rejects malformed identifiers, enums, time, counts, versions and inconsistent motion/duration', () => {
    for (const patch of [{ eventId: '' }, { userId: 101 }, { tableId: ' ' }, { gameCode: 'OTHER' }, { kind: 'WIN' },
      { version: -1 }, { version: 1.5 }, { remainingBefore: 0 }, { remainingBefore: 5 },
      { remainingBefore: 2 }, { durationMs: 2800 }, { occurredAt: 'bad' }, { occurredAt: '2026-10-27' }])
      expect(() => event(patch)).toThrow()
    expect(event({ hand: ['private'], balance: 99 })).not.toHaveProperty('hand')
    expect(event({ hand: ['private'], balance: 99 })).not.toHaveProperty('balance')
  })
  it('deduplicates both event ID and game/user even after stop or reconnect without restarting its clock', () => {
    const t = new DefeatTimeline(), e = event()
    const first = t.accept(e, 'table-1', position, now)
    expect(t.accept(e, 'table-1', position, now + 100)).toBeNull()
    expect(t.accept({ ...e, eventId: 'alias' }, 'table-1', position, now + 100)).toBeNull()
    expect(t.playing.get('101')).toBe(first)
    t.stop('101'); expect(t.accept(e, 'table-1', position, now + 200)).toBeNull()
    t.clear(); expect(t.accept(e, 'table-1', position, now + 300)).toBeNull()
  })
  it('keeps server time, expires a delayed event rather than starting a fresh clip and rejects future/older events', () => {
    const t = new DefeatTimeline(), e = event()
    expect(t.accept(e, 'table-1', position, now + 3100)).toBeNull()
    expect(t.accept(e, 'table-1', position, now - 6000)).toBeNull()
    expect(t.accept(e, 'table-1', position, now)?.at).toBe(now - 500)
    expect(t.accept(event({ eventId: 'old', gameId: 'older', occurredAt: new Date(now - 600).toISOString() }), 'table-1', position, now)).toBeNull()
    expect(t.accept(event({ eventId: 'next', gameId: 'next', occurredAt: new Date(now).toISOString() }), 'table-1', position, now)).not.toBeNull()
    t.stopGame('g'); expect(t.playing.size).toBe(1)
    t.stopGame('next'); expect(t.playing.size).toBe(0)
  })
  it('bounds replay memory while allowing later distinct games', () => {
    const t = new DefeatTimeline()
    for (let i = 0; i < 2050; i++) t.accept(event({ eventId: 'e' + i, gameId: 'g' + i }), 'table-1', position, now)
    expect(t.accept(event({ eventId: 'overflow', gameId: 'overflow' }), 'table-1', position, now)).toBeNull()
    expect(t.accept(event({ eventId: 'later', gameId: 'later', occurredAt: new Date(now + 11000).toISOString() }), 'table-1', position, now + 11000)).not.toBeNull()
  })
})

for (const name of ['man', 'girl'] as const) it(`${name}: actual rig reaches both temples, keeps seated legs and returns to neutral`, async () => {
  const rig = createCharacterRig(await characterSource(name)), figure = new Group(), motion = createAvatarMotion(rig)
  figure.add(rig.root)
  const pose = { x: 0, y: .8, z: 0, yaw: 0 }
  const avatar: AvatarSnapshot = { previous: pose, current: pose, at: 0, nickname: '', color: 0,
    moving: false, running: false, swimming: false, connected: true, emote: '', emoteAt: 0,
    tableId: 'table-1', seatIndex: 0, benchId: '', fitnessId: '', fitnessStartedAt: 0,
    telescopeId: '', telescopeYaw: 0, telescopePitch: 0, followTargetId: '' }
  const reaction: DefeatReaction = { key: 'g/101', gameId: 'g', userId: '101', kind: 'head-clutch', at: 0,
    tableId: 'table', channelId: 'channel', anchorId: 'table-1', position: { x: 0, y: .8, z: 0 } }
  const step = (time: number, value: DefeatReaction | null = reaction) => {
    motion.apply(avatar, time, 1 / 60, pose, figure, value); rig.root.updateMatrixWorld(true)
  }
  for (let i = 0; i < 90; i++) step(i * 1000 / 60)
  const head = rig.bones.head.getWorldPosition(new Vector3())
  for (const side of ['L', 'R'] as const) {
    const hand = rig.bones[`hand_${side}`].getWorldPosition(new Vector3())
    expect(hand.distanceTo(head)).toBeLessThan(.42)
    expect(hand.y).toBeGreaterThan(head.y - .12)
  }
  expect(rig.bones.head.rotation.x).toBeGreaterThan(.1)
  expect(rig.bones.upperLeg_L.rotation.x).toBeCloseTo(-Math.PI / 2, 3)
  for (let i = 90; i < 300; i++) step(i * 1000 / 60, null)
  expect(rig.bones.head.rotation.x).toBeCloseTo(0, 4)
  expect(sampleDefeatMotion('head-clutch', NaN, rig)).toBe(false)
  expect(sampleDefeatMotion('head-clutch', -1, rig)).toBe(false)
  expect(sampleDefeatMotion('head-clutch', 3600, rig)).toBe(false)
  expect(figure.position.toArray()).toEqual([0, 0, 0])
  // Non-subscribers have a public world pose but no seat metadata: overlay only.
  const publicAvatar = { ...avatar, seatIndex: -1, tableId: '' }
  for (let i = 0; i < 90; i++) motion.apply(publicAvatar, i * 1000 / 60, 1 / 60, pose, figure, reaction)
  rig.root.updateMatrixWorld(true)
  expect(rig.bones.head.rotation.x).toBeGreaterThan(.1)
  expect(Math.abs(rig.bones.upperLeg_L.rotation.x)).toBeLessThan(.01)
  expect(publicAvatar.tableId).toBe(''); expect(publicAvatar.seatIndex).toBe(-1)
  rig.dispose()
})
