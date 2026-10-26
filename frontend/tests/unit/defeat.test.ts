import { describe, expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { bridgeState } from '../fixtures/bridge'
import { characterSource } from '../fixtures/characterRig'
import { DefeatTimeline, remainingPlayers, type DefeatReaction } from '../../src/game/presentation/defeat'
import type { BridgeGame, DiceGame, OneCardGame } from '../../src/game/protocol'
import { createCharacterRig } from '../../src/world/art/CharacterRig'
import { createAvatarMotion } from '../../src/world/avatarMotion'
import { sampleDefeatMotion } from '../../src/world/art/defeatMotion'
import type { AvatarSnapshot } from '../../src/network/worldClient'

const now = Date.parse('2026-10-26T08:00:00Z')
const bridge = (count: 2 | 3 | 4 = 4): BridgeGame => ({ gameId: 'g', version: 1, role: 'PLAYER', bridge: bridgeState(count), secret: null })
const eliminated = (g: BridgeGame, ids: string[]): BridgeGame => ({ ...g, version: g.version + 1,
  bridge: { ...g.bridge, players: g.bridge.players.map(p => ids.includes(p.userId) ? { ...p, forfeited: true } : p) } })
const finish = (g: BridgeGame, winners: string[]): BridgeGame => ({ ...g, version: g.version + 1,
  bridge: { ...g.bridge, status: 'FINISHED', stage: 'FINISHED', endedAt: new Date(now).toISOString(), winnerUserIds: winners } })

describe('server-confirmed defeat transitions', () => {
  it.each([3, 4] as const)('uses head-clutch for a confirmed forfeit with %i remaining participants', count => {
    const t = new DefeatTimeline(), before = bridge(count)
    t.observe(before, eliminated(before, ['101']), now)
    expect(t.playing.get('101')?.kind).toBe('head-clutch')
    expect(t.playing.size).toBe(1)
  })
  it('uses table-flip after a four-player game has genuinely narrowed to two', () => {
    const t = new DefeatTimeline(), before = eliminated(bridge(), ['103', '104'])
    expect(remainingPlayers(before)).toEqual(['101', '102'])
    t.observe(before, eliminated(before, ['101']), now)
    expect(t.playing.get('101')?.kind).toBe('table-flip')
    t.clear(); t.observe(before, finish(before, ['102']), now)
    expect([...t.playing.keys()]).toEqual(['101'])
    expect(t.playing.get('101')?.kind).toBe('table-flip')
  })
  it('counts pending bridge forfeits once and never counts individual pawns', () => {
    const t = new DefeatTimeline(), before = bridge()
    const pending: BridgeGame = { ...before, version: 2, bridge: { ...before.bridge,
      players: before.bridge.players.map(p => p.userId === '101' ? { ...p, pendingForfeit: true } : p) } }
    t.observe(before, pending, now)
    const reaction = t.playing.get('101')
    expect(reaction?.kind).toBe('head-clutch')
    const after = eliminated(pending, ['101']); t.observe(pending, after, now + 500)
    expect(t.playing.get('101')).toBe(reaction)
    expect(remainingPlayers(pending)).toHaveLength(3)
  })
  it('animates only new losers at a multiplayer finish, excluding winners and earlier forfeits', () => {
    const t = new DefeatTimeline(), before = eliminated(bridge(), ['104'])
    t.observe(before, finish(before, ['102', '103']), now)
    expect([...t.playing.keys()]).toEqual(['101'])
    expect(t.playing.get('101')?.kind).toBe('head-clutch')
  })
  it('does not turn a draw or a game with no winner into a defeat', () => {
    const t = new DefeatTimeline(), before = bridge()
    t.observe(before, finish(before, []), now)
    expect(t.playing.size).toBe(0)
  })
  it('ignores initial/recovered terminal states, duplicates, stale versions and foreign participants', () => {
    const t = new DefeatTimeline(), before = bridge(), after = finish(before, ['102'])
    t.observe(null, after, now); expect(t.playing.size).toBe(0)
    t.observe(before, { ...after, version: before.version }, now); expect(t.playing.size).toBe(0)
    t.observe(before, { ...after, version: before.version + 2 }, now); expect(t.playing.size).toBe(0)
    t.observe(before, { ...after, gameId: 'other' }, now); expect(t.playing.size).toBe(0)
    t.observe(before, { ...after, bridge: { ...after.bridge, players: after.bridge.players.slice(1) } }, now); expect(t.playing.size).toBe(0)
    t.observe(before, after, now); const reaction = t.playing.get('101')
    t.observe(before, after, now + 100); t.observe(after, { ...after, version: 10 }, now + 200)
    expect(t.playing.get('101')).toBe(reaction)
    t.stop('101'); t.observe(before, after, now + 300); expect(t.playing.has('101')).toBe(false)
    t.clear(); t.observe(before, after, now); expect(t.playing.has('101')).toBe(true)
  })
  it('does not replay old results or invalid future timestamps', () => {
    const t = new DefeatTimeline(), before = bridge(), after = finish(before, ['102'])
    t.observe(before, after, now + 3600); expect(t.playing.size).toBe(0)
    t.clear(); t.observe(before, after, now - 6000); expect(t.playing.size).toBe(0)
  })
  it('uses the same confirmed public transition for an authorized spectator', () => {
    const t = new DefeatTimeline(), before = { ...bridge(), role: 'SPECTATOR' as const }
    t.observe(before, finish(before, ['102']), now)
    expect(t.playing.size).toBe(3)
  })
  it('handles ONE_CARD active flags and DICE final winners without private state', () => {
    const t = new DefeatTimeline()
    const cards = { gameId: 'cards', version: 1, role: 'SPECTATOR', hand: null, onecard: {
      status: 'PLAYING', players: ['101', '102', '103'].map(userId => ({ userId, active: true })) } } as OneCardGame
    const next = { ...cards, version: 2, onecard: { ...cards.onecard,
      players: cards.onecard.players.map(p => p.userId === '101' ? { ...p, active: false } : p) } }
    t.observe(cards, next, now); expect(t.playing.get('101')?.kind).toBe('head-clutch')
    const dice = { gameId: 'dice', version: 1, role: 'PLAYER', dice: { status: 'PLAYING', players: ['101', '102'] } } as DiceGame
    t.observe(dice, { ...dice, version: 2, dice: { ...dice.dice, status: 'FINISHED', winnerUserId: '102', endedAt: new Date(now).toISOString() } }, now)
    expect(t.playing.get('101')?.kind).toBe('table-flip')
    t.observe(null, null, now); expect(t.playing.size).toBe(0)
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
  const reaction: DefeatReaction = { key: 'g/101', gameId: 'g', userId: '101', kind: 'head-clutch', at: 0 }
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
  rig.dispose()
})
