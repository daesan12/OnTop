import { beforeEach, expect, it } from 'vitest'
import { parseGame } from '../../src/game/protocol'
import { parseBridge, parseSecret, type Resolution, type SecretDie } from '../../src/game/bridge/protocol'
import { canActBridge } from '../../src/game/bridge/actions'
import { createMotions, presentedPawns, sampleMotion, shouldAnimate } from '../../src/game/bridge/motion'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import { bridgeState } from '../fixtures/bridge'
const send = (type: string, payload: Record<string, unknown>) => receiveGame({ type, payload, requestId: null }, '101', 't')
const restore = (b = bridgeState(), secret: SecretDie | null = null, version = 0) => send('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'bridge', version,
  state: { publicState: b, privateState: secret ?? {} } })
const secret: SecretDie = { userId: '101', turnId: 1, die: 'X' }
beforeEach(resetGame)
it.each([2, 3, 4] as const)('validates %i players with seven unique pawns and eight immutable slots', count => {
  const b = bridgeState(count); expect(parseBridge(b)).toEqual(b); restore(b); expect(canActBridge('101', { kind: 'roll' })).toBe(true)
  b.players[1]!.pawns[0]!.id = 1; expect(() => parseBridge(b)).toThrow()
})
it('accepts an atomic secret only for the current owner/turn and clears it before/after the hidden phases', () => {
  const b = bridgeState(); b.stage = 'DECLARING'; restore(b, secret)
  expect(useGame.getState().game!.secret).toEqual(secret); expect(canActBridge('101', { kind: 'declare', value: 4 })).toBe(true)
  expect(() => parseSecret({ ...secret, userId: '102' }, '101', 'PLAYER', b)).toThrow()
  expect(() => parseSecret({ ...secret, turnId: 2 }, '101', 'PLAYER', b)).toThrow()
  expect(() => parseSecret({}, '101', 'PLAYER', b)).toThrow()
  expect(() => parseSecret(secret, '102', 'PLAYER', b)).toThrow()
  expect(() => parseGame({ gameId: 'bridge', version: 1, role: 'SPECTATOR', publicState: b, privateState: secret }, '505')).toThrow()
  expect(parseGame({ gameId: 'bridge', version: 1, role: 'SPECTATOR', publicState: b, privateState: {} }, '505').secret).toBeNull()
  b.players[0]!.pendingForfeit = true; expect(parseSecret({}, '101', 'PLAYER', b)).toBeNull(); expect(() => parseSecret(secret, '101', 'PLAYER', b)).toThrow()
  restore(b, null, 2); expect(canActBridge('101', { kind: 'declare', value: 4 })).toBe(false)
})
it('never keeps/reveals an unchallenged face and only permits explicit challenged public disclosure', () => {
  const b = bridgeState(); b.stage = 'RESOLVING'; b.declaration = 4
  const r: Resolution = { turnId: 1, declarerUserId: '101', declaredNumber: 4, challenged: false, startedAt: new Date().toISOString(), operations: [] }
  b.resolution = r; restore(b); expect(useGame.getState().game!.secret).toBeNull(); expect(JSON.stringify(parseBridge(b))).not.toMatch(/actualFace|wasBluff|challengerUserId|"die"/)
  for (const field of ['actualFace', 'challengerUserId', 'wasBluff']) expect(() => parseBridge({ ...b, resolution: { ...r, [field]: null } })).toThrow()
  expect(() => parseBridge({ ...b, die: 'X' })).toThrow()
  b.resolution = { ...r, challenged: true, actualFace: 'X', challengerUserId: '102', wasBluff: true }
  expect(parseBridge(b).resolution!.actualFace).toBe('X')
})
it('permits only the sequential responder, including a player with scored pawns but no active pawn', () => {
  const b = bridgeState(3); b.stage = 'RESPONDING'; b.turnUserId = '102'; b.responderUserId = '101'; b.declaration = 3; b.responseOrder = ['103', '101']; b.acceptedBy = ['103']
  restore(b); expect(canActBridge('101', { kind: 'trust' })).toBe(true); expect(canActBridge('101', { kind: 'doubt' })).toBe(true); expect(canActBridge('103', { kind: 'doubt' })).toBe(false)
  b.players[0]!.pawns.forEach((p, i) => { p.status = i === 0 ? 'SCORED' : 'FALLEN'; p.position = i === 0 ? 9 : 0; p.goalSlot = i === 0 ? 1 : null })
  b.players[0]!.score = b.players[0]!.goals = 1; b.nextGoalSlot = 2; b.goalSlots[0] = { slot: 1, status: 'OCCUPIED', userId: '101', pawnId: 1, removedReason: null, firstAssignedTurnId: 1 }
  restore(b, null, 1); expect(canActBridge('101', { kind: 'doubt' })).toBe(true)
})
it('preserves vacated history/score and rejects reassigned, reordered or duplicated public slot data', () => {
  const b = bridgeState(); b.players[0]!.pawns[0] = { id: 1, status: 'REMOVED_SCORED', position: 9, goalSlot: 1 }; b.players[0]!.pawns[1]!.status = 'ACTIVE'
  b.nextGoalSlot = 2; b.goalSlots[0] = { slot: 1, status: 'VACATED', userId: null, pawnId: null, removedReason: 'FAILED_DOUBT', firstAssignedTurnId: 1 }
  expect(parseBridge(b).players[0]!.score).toBe(0); expect(parseBridge(b).goalSlots[0]!.status).toBe('VACATED')
  expect(() => parseBridge({ ...b, nextGoalSlot: 1 })).toThrow()
  expect(() => parseBridge({ ...b, goalSlots: [...b.goalSlots].reverse() })).toThrow()
  const bad = structuredClone(b); bad.players[0]!.score = 1; expect(() => parseBridge(bad)).toThrow()
})
it('blocks deadline equality, pending/ack/uncertain/recovery/resolving/finished/forfeited and extra injected fields', () => {
  const b = bridgeState(); restore(b)
  expect(canActBridge('101', { kind: 'roll' }, Date.parse(b.turnDeadline!))).toBe(false)
  expect(canActBridge('101', { kind: 'roll', die: 4 } as never)).toBe(false)
  for (const patch of [{ pending: true }, { uncertain: true }, { awaitingVersion: 1 }, { recovery: 'PENDING' as const }]) {
    resetGame(); restore(b); useGame.setState(patch); expect(canActBridge('101', { kind: 'roll' })).toBe(false)
  }
  resetGame(); b.stage = 'RESOLVING'; restore(b); expect(canActBridge('101', { kind: 'roll' })).toBe(false)
  b.stage = 'AWAITING_ROLL'; b.players[0]!.forfeited = true; restore(b, null, 1); expect(canActBridge('101', { kind: 'roll' })).toBe(false)
  const finished = bridgeState(); finished.status = 'FINISHED'; finished.stage = 'FINISHED'; finished.turnUserId = null; finished.turnDeadline = null
  finished.endReason = 'THREE_GOALS'; finished.endedAt = new Date().toISOString(); finished.winnerUserIds = ['101']
  restore(finished, null, 2); expect(canActBridge('101', { kind: 'roll' })).toBe(false)
  send('TABLE_LEFT', {}); expect(useGame.getState().game).toBeNull()
})
it('animates only a new live resolution and snaps recovery/duplicates to authoritative targets', () => {
  const old = bridgeState(), b = structuredClone(old), now = Date.now()
  b.players[0]!.pawns[0]!.position = 4
  const resolution: Resolution = { turnId: 1, declarerUserId: '101', declaredNumber: 4, challenged: false, startedAt: new Date(now).toISOString(), operations: [{ type: 'MOVE_PAWN', userId: '101', pawnId: 1, fromPosition: 0, toPosition: 4, slotNumber: null, reason: null }] }
  const cursor = { gameId: 'b', version: 3, resolutionTurnId: 1 }
  expect(shouldAnimate(null, cursor, resolution, now)).toBe(false)
  expect(shouldAnimate({ gameId: 'b', version: 2, resolutionTurnId: -1 }, cursor, resolution, now)).toBe(true)
  expect(shouldAnimate(cursor, cursor, resolution, now)).toBe(false)
  expect(shouldAnimate({ ...cursor, version: 2, resolutionTurnId: -1 }, cursor, resolution, now + 1500)).toBe(false)
  const motions = createMotions(presentedPawns(old), presentedPawns(b), resolution), motion = motions.get(1)!, out = { ...motion.from }
  sampleMotion(motion, 1500, out); expect(out).toEqual(motion.to); expect(old.players[0]!.pawns[0]!.position).toBe(0)
  sampleMotion({ ...motion, kind: 'fall', to: { ...motion.to, scale: 0 } }, 300, out); expect(out.y).toBeLessThan(motion.from.y); expect(out.scale).toBeLessThan(1)
})
