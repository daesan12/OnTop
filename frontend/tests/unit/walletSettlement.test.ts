import { expect, test } from 'vitest'
import { consumeWalletRewardSoundLevel, receiveWalletSettlement, refreshWalletAfterSettlement, useWalletSettlement } from '../../src/features/wallet/settlementRefresh'
import type { Envelope } from '../../src/network/protocol'

const receipt = (userId: string, version = 2): Envelope => ({
  type: 'GAME_RESULT', requestId: null,
  payload: { gameSessionId: `game-${userId}`, version, gameCode: 'OMOK', status: 'FINISHED', endReason: 'NORMAL',
    settlementStatus: 'SETTLED', betAmountPerPlayer: 10, myCoinDelta: 10, endedAt: '2026-10-28T00:00:00Z',
    participants: [{ userId, result: 'WIN' }, { userId: 'other', result: 'LOSE' }] },
})

test('only valid own settled receipts trigger a refresh; replay cannot repeat it', () => {
  const owner = 'wallet-unit-owner', message = receipt(owner), before = useWalletSettlement.getState().revision
  receiveWalletSettlement({ ...message, payload: { ...message.payload, settlementStatus: 'PENDING', myCoinDelta: null } }, owner)
  receiveWalletSettlement(receipt('someone-else'), owner)
  receiveWalletSettlement({ ...message, payload: { ...message.payload, myCoinDelta: '10' } }, owner)
  expect(useWalletSettlement.getState().revision).toBe(before)
  receiveWalletSettlement(message, owner)
  expect(useWalletSettlement.getState()).toEqual({ owner, revision: before + 1 })
  receiveWalletSettlement(message, owner)
  expect(useWalletSettlement.getState().revision).toBe(before + 1)
  receiveWalletSettlement(receipt(owner, 3), owner)
  expect(useWalletSettlement.getState().revision).toBe(before + 2)
})

test('minigame recovery invalidates once per accepted receipt and isolates accounts', () => {
  const before = useWalletSettlement.getState().revision
  refreshWalletAfterSettlement('mini-owner', 'minigame:123')
  refreshWalletAfterSettlement('mini-owner', 'minigame:123')
  refreshWalletAfterSettlement('', 'minigame:123')
  expect(useWalletSettlement.getState()).toEqual({ owner: 'mini-owner', revision: before + 1 })
  refreshWalletAfterSettlement('another-owner', 'minigame:123')
  expect(useWalletSettlement.getState()).toEqual({ owner: 'another-owner', revision: before + 2 })
})

test('fitness server receipt refreshes once and rejects foreign or malformed receipts', () => {
  const userId = 'fitness-owner', before = useWalletSettlement.getState().revision
  const message: Envelope = { requestId: null, type: 'FITNESS_REWARD', payload: {
    userId, receipt: 'fitness:01234567-89ab-cdef-0123-456789abcdef:1',
  } }
  receiveWalletSettlement({ ...message, payload: { ...message.payload, userId: 'other' } }, userId)
  receiveWalletSettlement({ ...message, payload: { userId, receipt: 'fitness:fake:0' } }, userId)
  expect(useWalletSettlement.getState().revision).toBe(before)
  receiveWalletSettlement(message, userId)
  receiveWalletSettlement(message, userId)
  expect(useWalletSettlement.getState()).toEqual({ owner: userId, revision: before + 1 })
})

test('운동 획득음만 낮추고 중복 영수증과 다른 보상 및 다른 계정에는 음량을 남기지 않는다', () => {
  const userId = 'quiet-fitness-owner'
  const message: Envelope = { requestId: null, type: 'FITNESS_REWARD', payload: {
    userId, receipt: 'fitness:01234567-89ab-cdef-0123-456789abcdef:10',
  } }
  receiveWalletSettlement(message, userId)
  expect(consumeWalletRewardSoundLevel(userId)).toBe(.7)
  receiveWalletSettlement(message, userId)
  expect(consumeWalletRewardSoundLevel(userId)).toBe(1)
  refreshWalletAfterSettlement(userId, 'jumpmap:channel:1')
  expect(consumeWalletRewardSoundLevel(userId)).toBe(1)
  refreshWalletAfterSettlement(userId, 'fitness:another-visit:1')
  refreshWalletAfterSettlement(userId, 'board:match:1')
  expect(consumeWalletRewardSoundLevel(userId)).toBe(1)
  refreshWalletAfterSettlement(userId, 'fitness:another-visit:2')
  expect(consumeWalletRewardSoundLevel('another-account')).toBe(1)
})
