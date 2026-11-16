import { expect, it } from 'vitest'
import { StoneControlQueue } from '../../src/game/stone-rumble/controlQueue'
import type { StoneControl } from '../../src/game/stone-rumble/protocol'

const input = (seq: number, extra: Partial<StoneControl> = {}): StoneControl => ({ kind: 'control', seq, x: 0, z: 0, aimX: 1, aimZ: 0, jump: false, fire: false, slide: false, ...extra })
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function setup() {
  const sent: { scope: string; input: StoneControl; ack: (ok: boolean) => void; reject: (error: Error) => void }[] = []
  const queue = new StoneControlQueue((scope, control) => new Promise((resolve, reject) => sent.push({ scope, input: control, ack: resolve, reject })))
  return { sent, queue }
}
it('8인 각각의 지연 응답 중 100번 입력해도 요청은 하나이며 최신 방향과 세 행동을 합친다', async () => {
  const peers = Array.from({ length: 8 }, setup)
  for (const { queue, sent } of peers) {
    void queue.send('match', input(1))
    for (let i = 2; i <= 100; i++) void queue.send('match', input(i, { x: i % 2 ? 1 : -1, aimZ: i, jump: i === 10, fire: i === 20, slide: i === 30 }))
    expect(sent).toHaveLength(1)
    sent[0]!.ack(true)
  }
  await flush()
  for (const { sent } of peers) {
    expect(sent).toHaveLength(2)
    expect(sent[1]!.input).toEqual(input(100, { x: -1, aimZ: 100, jump: true, fire: true, slide: true }))
    sent[1]!.ack(true)
  }
  await flush()
  for (const { sent } of peers) expect(sent).toHaveLength(2)
})
it('채팅·안내·blur 정지 신호는 대기 중인 이동과 행동을 취소한다', async () => {
  const { queue, sent } = setup()
  void queue.send('match', input(1))
  const action = queue.send('match', input(2, { x: 1, jump: true, fire: true, slide: true }))
  void queue.send('match', input(3), true)
  expect(await action).toBe(false)
  sent[0]!.ack(true); await flush()
  expect(sent[1]!.input).toEqual(input(3))
})
it.each(['reset', 'failure', 'timeout'] as const)('종료·복구·연결 종료 또는 실패 뒤 대기 행동을 재전송하지 않는다: %s', async mode => {
  const { queue, sent } = setup()
  void queue.send('old', input(1))
  const pending = queue.send('old', input(2, { fire: true }))
  if (mode === 'reset') queue.reset()
  if (mode === 'timeout') sent[0]!.reject(new Error('socket request timed out'))
  else sent[0]!.ack(mode === 'reset')
  await flush()
  expect(await pending).toBe(false)
  expect(sent).toHaveLength(1)
})
it('다음 경기는 이전 응답이 끝난 뒤 새 입력만 전송한다', async () => {
  const { queue, sent } = setup()
  void queue.send('old', input(1))
  void queue.send('old', input(2, { fire: true }))
  void queue.send('new', input(3))
  expect(sent).toHaveLength(1)
  sent[0]!.ack(false); await flush()
  expect(sent[1]).toMatchObject({ scope: 'new', input: input(3) })
})
