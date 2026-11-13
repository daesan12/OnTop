import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { JumpRopeService, jumpRopeService, type JumpRopeReceipt } from '../../src/features/jumpRope/service'
import { closeJumpRope, retryJumpRope, submitJumpRope, useJumpRope } from '../../src/features/jumpRope/store'
import { useWalletSettlement } from '../../src/features/wallet/settlementRefresh'
import { JumpRopeResult } from '../../src/jump-rope-preview/JumpRopeResult'
import { useSession } from '../../src/network/worldClient'

const receipt: JumpRopeReceipt = { id: '415', rulesVersion: 1, score: 1965, counts: { perfect: 66, good: 0, miss: 0 },
  endReason: 'time', completedAt: '2026-11-12T00:01:03Z', reward: 39 }
const result = (props: Partial<Parameters<typeof JumpRopeResult>[0]> = {}) => renderToStaticMarkup(createElement(JumpRopeResult,
  { reason: 'time', onQuit: () => {}, onRestart: () => {}, onOpenRanking: () => {}, ...props }))
const sessionId = useSession.getState().sessionId
afterEach(() => {
  vi.restoreAllMocks()
  useJumpRope.setState({ settlement: null, active: false, open: false })
  useSession.setState({ sessionId })
})

test('preserves the actual API reward and keeps older receipts without a reward amount', async () => {
  const request = vi.fn().mockResolvedValueOnce({ ...receipt, reward: 3 }).mockResolvedValueOnce({ ...receipt, reward: 0 })
    .mockResolvedValueOnce({ ...receipt, reward: undefined })
  const service = new JumpRopeService(request)
  await expect(service.complete(receipt.id, [])).resolves.toMatchObject({ reward: 3 })
  await expect(service.complete(receipt.id, [])).resolves.toMatchObject({ reward: 0 })
  await expect(service.complete(receipt.id, [])).resolves.toMatchObject({ reward: null })
})

test.each([-1, 1.5, '39', null])('rejects invalid server reward %j', async reward => {
  const service = new JumpRopeService(vi.fn().mockResolvedValue({ ...receipt, reward }))
  await expect(service.complete(receipt.id, [])).rejects.toMatchObject({ retryable: true })
})

test('renders amounts only when confirmed and uses a separate message for a confirmed early exit', () => {
  expect(result({ stats: receipt, reward: 3 })).toContain('획득 엽전 <strong>+3냥</strong>')
  expect(result({ stats: receipt, reward: 0 })).toContain('획득 엽전 <strong>0냥</strong>')
  expect(result({ reason: 'missLimit', reward: 0 })).toContain('3회 MISS로 엽전이 지급되지 않았어요.')
  for (const props of [{ stats: receipt }, { reward: null }, { status: '기록 저장 중' }, { status: '기록 저장 실패' }]) {
    expect(result(props)).not.toContain('rope-result__reward')
  }
  expect(result({ reason: 'missLimit' })).not.toContain('지급되지 않았어요')
})

test('a failed submit can retry and refresh the wallet once even after closing the game', async () => {
  const owner = 'jump-reward-retry-owner'
  useSession.setState({ sessionId: owner })
  useJumpRope.setState({ open: true })
  const complete = vi.spyOn(jumpRopeService, 'complete').mockRejectedValueOnce(new Error('network')).mockResolvedValue(receipt)
  const submission = { owner, id: receipt.id, offsets: [728335], expiresAt: Infinity, reason: 'time' as const }
  const before = useWalletSettlement.getState().revision
  submitJumpRope(submission)
  expect(useJumpRope.getState().settlement?.status).toBe('saving')
  await vi.waitFor(() => expect(useJumpRope.getState().settlement?.status).toBe('failed'))
  expect(useWalletSettlement.getState().revision).toBe(before)
  retryJumpRope()
  closeJumpRope()
  await vi.waitFor(() => expect(useJumpRope.getState().settlement).toMatchObject({ status: 'saved', receipt }))
  expect(useJumpRope.getState().open).toBe(false)
  submitJumpRope(submission)
  retryJumpRope()
  expect(complete.mock.calls).toEqual([[receipt.id, [728335]], [receipt.id, [728335]]])
  expect(useWalletSettlement.getState()).toEqual({ owner, revision: before + 1 })
})

test.each([0, null, 39])('does not refresh a zero, missing, or previous account reward (%j)', async reward => {
  const owner = 'jump-reward-owner'
  useSession.setState({ sessionId: owner })
  vi.spyOn(jumpRopeService, 'complete').mockResolvedValue({ ...receipt, reward })
  const before = useWalletSettlement.getState().revision
  submitJumpRope({ owner, id: receipt.id, offsets: [], expiresAt: Infinity, reason: 'time' })
  if (reward === 39) useSession.setState({ sessionId: 'jump-reward-next-owner' })
  await vi.waitFor(() => expect(useJumpRope.getState().settlement?.status).toBe('saved'))
  expect(useWalletSettlement.getState().revision).toBe(before)
})
