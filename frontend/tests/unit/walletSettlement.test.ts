import { expect, test } from 'vitest'
import { receiveWalletSettlement, refreshWalletAfterSettlement, useWalletSettlement } from '../../src/features/wallet/settlementRefresh'
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
