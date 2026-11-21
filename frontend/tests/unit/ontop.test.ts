import { describe, expect, it, beforeEach } from 'vitest'
import { acceptOntopActor, acceptOntopReply, isOntopCommand, ontopChatText, resetOntop, useOntop } from '../../src/features/ai/ontop'

describe('온탑 개인 대화', () => {
  beforeEach(resetOntop)
  it('정확한 호출만 가로채고 대화중 본문은 온탑 명령으로 보낸다', () => {
    expect(isOntopCommand('/온탑')).toBe(true)
    expect(isOntopCommand('/온탑 안녕')).toBe(true)
    expect(isOntopCommand('/온탑이름')).toBe(false)
    expect(ontopChatText('눈싸움하자', true)).toBe('/온탑 눈싸움하자')
    expect(ontopChatText('안녕', false)).toBe('안녕')
  })
  it('다른 사용자·채널 대사를 거절하고 생각중 응답은 같은 메시지에서 교체한다', () => {
    const reply = { channelId: 'a', userId: 'first', id: 'one', text: '안녕', speech: '생각중', source: 'PENDING', closed: false, pending: true, invited: false }
    expect(acceptOntopReply(reply, 'a', 'second')).toBe(false)
    expect(acceptOntopReply(reply, 'b', 'first')).toBe(false)
    expect(acceptOntopReply(reply, 'a', 'first')).toBe(true)
    acceptOntopReply({ ...reply, speech: '안녕!', pending: false }, 'a', 'first')
    expect(useOntop.getState().replies).toHaveLength(1)
    expect(useOntop.getState().replies[0]?.speech).toBe('안녕!')
    acceptOntopReply({ ...reply, id: 'two', closed: true }, 'a', 'first')
    expect(useOntop.getState().talking).toBe(false)
  })
  it('오래된 위치와 잘못된 좌표를 거절하고 채널 초기화에서 대화와 NPC를 지운다', () => {
    const actor = { channelId: 'a', version: 2, id: 'npc-ontop-a', name: '온탑', x: -5, y: 0, z: 44, yaw: 0, action: 'IDLE', opponentId: '', result: '', endsAt: 0, speech: '', speechUntil: 0 }
    expect(acceptOntopActor(actor, 'a')).toBe(true)
    expect(acceptOntopActor({ ...actor, version: 1 }, 'a')).toBe(false)
    expect(acceptOntopActor({ ...actor, version: 3, x: NaN }, 'a')).toBe(false)
    resetOntop()
    expect(useOntop.getState().actor).toBeNull()
    expect(useOntop.getState().replies).toEqual([])
  })
})
