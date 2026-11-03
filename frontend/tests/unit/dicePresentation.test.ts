import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiceGame, Farkle, OmokGame } from '../../src/game/protocol'
import { diceFocusActive } from '../../src/game/farkle/camera'
import { farkleSpectatorStatus } from '../../src/game/farkle/spectatorStatus'
import { diceSound, disposeDiceSound, setDiceSound, unlockDiceSound, useDiceSound } from '../../src/game/farkle/sound'

const state = (patch: Partial<Farkle> = {}): Farkle => ({ gameCode: 'DICE', status: 'PLAYING', players: ['a', 'b'],
  scores: [100, 200], targetScore: 4000, turnTimeLimitMs: 30000, turnUserId: 'a', turnDeadline: '2099-01-01T00:00:30Z',
  turnScore: 0, dice: [], stage: 'AWAITING_ROLL', rollId: 1, round: 1, hotDice: false, lastEvent: 'START',
  winnerUserId: null, endReason: null, endedAt: null, ...patch })
const game = (patch: Partial<Farkle> = {}, role: 'PLAYER' | 'SPECTATOR' = 'PLAYER'): DiceGame => ({ gameId: 'g', version: 1, role, dice: state(patch) })

describe('original dice camera ownership', () => {
  it('automatically follows the own turn and keeps fixed view optional on the opponent turn', () => {
    expect(diceFocusActive(game(), 'a', false)).toBe(true)
    expect(diceFocusActive(game(), 'b', false)).toBe(false)
    expect(diceFocusActive(game(), 'b', true)).toBe(true)
    expect(diceFocusActive(game(), 'a', true)).toBe(true)
  })
  it('cannot claim a spectator, stranger, finished round or another game', () => {
    expect(diceFocusActive(game({}, 'SPECTATOR'), 'a', true)).toBe(false)
    expect(diceFocusActive(game(), 'stranger', true)).toBe(false)
    expect(diceFocusActive(game({ status: 'FINISHED' }), 'a', true)).toBe(false)
    expect(diceFocusActive(null, 'a', true)).toBe(false)
    expect(diceFocusActive({ role: 'PLAYER' } as OmokGame, 'a', true)).toBe(false)
  })
})
describe('read-only public spectator messages', () => {
  const names = ['가람', '나래']
  it('uses the presentation animation only for a new confirmed roll and describes selection afterwards', () => {
    const d = state({ stage: 'SELECTING', lastEvent: 'HOT_DICE', hotDice: true })
    expect(farkleSpectatorStatus(d, names, true)).toBe('싹쓸이! · 가람이 주사위를 굴리고 있습니다')
    expect(farkleSpectatorStatus(d, names, false)).toBe('싹쓸이! · 가람이 득점 주사위를 고르고 있습니다')
  })
  it('preserves BUST and BANK context without inventing discarded faces or a last-bank amount', () => {
    expect(farkleSpectatorStatus(state({ turnUserId: 'b', lastEvent: 'BUST' }), names, false))
      .toBe('가람 허탕! · 이번 턴 점수 소멸. 나래의 차례 · 굴림 대기')
    expect(farkleSpectatorStatus(state({ turnUserId: 'b', lastEvent: 'BANK' }), names, false))
      .toBe('가람 점수 챙기기 · 점수 저장. 나래의 차례 · 굴림 대기')
  })
  it('requires the server result for a winner and displays a timeout only as a turn change', () => {
    expect(farkleSpectatorStatus(state({ lastEvent: 'TURN_TIMEOUT' }), names, false)).toContain('차례 시간 만료. 가람의 차례')
    expect(farkleSpectatorStatus(state({ status: 'FINISHED', winnerUserId: 'b' }), names, true)).toBe('나래 승리 · 경기 종료')
  })
})

describe('optional dice audio lifetime', () => {
  let now = 0
  const parameter = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
  const makeTone = () => ({ frequency: parameter(), type: '', onended: null as (() => void) | null,
    connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() })
  const contexts: FakeAudio[] = []
  class FakeAudio {
    state = 'running'; currentTime = 0; destination = {}
    resume = vi.fn().mockResolvedValue(undefined)
    close = vi.fn().mockResolvedValue(undefined)
    tones: ReturnType<typeof makeTone>[] = []
    constructor() { contexts.push(this) }
    createOscillator() {
      const tone = makeTone()
      this.tones.push(tone); return tone
    }
    createGain() { return { gain: parameter(), connect: vi.fn((target: unknown) => target), disconnect: vi.fn() } }
  }
  beforeEach(() => {
    now = 0; contexts.length = 0; useDiceSound.setState({ enabled: true })
    vi.stubGlobal('AudioContext', FakeAudio); vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => { disposeDiceSound(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
  it('stays silent before a gesture, throttles shake events and disconnects completed tones', () => {
    diceSound(1); expect(contexts).toHaveLength(0)
    unlockDiceSound(); diceSound(1)
    const context = contexts[0]!, first = context.tones[0]!
    expect(first.start).toHaveBeenCalledOnce()
    now = 79; diceSound(1); expect(context.tones).toHaveLength(1)
    first.onended!(); expect(first.disconnect).toHaveBeenCalledOnce()
    now = 80; diceSound(.5); expect(context.tones).toHaveLength(2)
  })
  it('mutes active audio immediately and keeps the preference across scene cleanup', () => {
    unlockDiceSound(); diceSound()
    const context = contexts[0]!, tone = context.tones[0]!
    setDiceSound(false)
    expect(tone.stop).toHaveBeenCalledTimes(2); expect(tone.disconnect).toHaveBeenCalledOnce()
    now = 100; diceSound(); unlockDiceSound(); expect(context.tones).toHaveLength(1)
    disposeDiceSound(); expect(context.close).toHaveBeenCalledOnce(); expect(useDiceSound.getState().enabled).toBe(false)
    setDiceSound(true); expect(contexts).toHaveLength(2)
  })
  it('bounds unfinished voices and suppresses audio in hidden pages', () => {
    unlockDiceSound(); diceSound(); now = 100; diceSound(); now = 200; diceSound()
    expect(contexts[0]!.tones).toHaveLength(2)
    contexts[0]!.tones[0]!.onended!()
    vi.stubGlobal('document', { hidden: true }); now = 300; diceSound()
    expect(contexts[0]!.tones).toHaveLength(2)
  })
  it('tolerates unsupported audio, rejected resume and suspended contexts', async () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('blocked') } })
    expect(() => unlockDiceSound()).not.toThrow()
    vi.stubGlobal('AudioContext', FakeAudio); unlockDiceSound()
    contexts[0]!.state = 'suspended'; contexts[0]!.resume.mockRejectedValueOnce(new Error('gesture required'))
    expect(() => unlockDiceSound()).not.toThrow(); diceSound(); await Promise.resolve()
    expect(contexts[0]!.tones).toHaveLength(0)
  })
})
