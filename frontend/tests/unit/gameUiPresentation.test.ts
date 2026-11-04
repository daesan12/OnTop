import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('../../src/park/runtime/ParkRuntime', () => ({ useParkRuntime: () => ({}) }))
import { OmokRequestCard } from '../../src/game/omok/OmokRequestCard'
import { AlkkagiOpponentCards, AlkkagiUsedCardNotice } from '../../src/game/alkkagi/AlkkagiPresentation'
import { GameSpectatorBadge } from '../../src/game/GameSpectatorCount'

const request = { label: '무르기', symbol: '↶', pending: false, requester: false, remaining: 0,
  requestDisabled: false, responseDisabled: false, requestHint: '내 차례에 상대 동의', onRequest() {}, onRespond() {} }

it('대기 중이 아니면 요청 버튼만 표시하고 지난 결과는 재접속 때 다시 띄우지 않는다', () => {
  const html = renderToStaticMarkup(createElement(OmokRequestCard, { ...request, decision: '무르기 완료', decisionId: 'old' }))
  expect(html).toContain('>무르기</button>')
  expect(html).not.toContain('progress'); expect(html).not.toContain('무르기 완료')
})
it('기한이 지난 응답은 수락과 거절 모두 비활성화하고 요청자에게는 응답 버튼을 주지 않는다', () => {
  const html = renderToStaticMarkup(createElement(OmokRequestCard, { ...request, pending: true }))
  expect((html.match(/disabled=""/g) ?? []).length).toBe(2)
  const own = renderToStaticMarkup(createElement(OmokRequestCard, { ...request, pending: true, requester: true, remaining: 2000 }))
  expect(own).not.toContain('<button'); expect(own).toContain('상대의 응답을 기다리고 있어요.')
})
it('상대 보관 패는 장수와 뒷면만 보여 주며 발동 카드 앞면은 즉시 읽는다', () => {
  const hand = renderToStaticMarkup(createElement(AlkkagiOpponentCards, { count: 3, nickname: '상대' }))
  expect(hand).toContain('상대 비책 3장'); expect(hand).not.toContain('<img'); expect(hand).not.toContain('벽 설치')
  const used = renderToStaticMarkup(createElement(AlkkagiUsedCardNotice, { nickname: '상대', card:
    { version: 2, turnNumber: 1, actor: 1, type: 'WALL', targets: [], at: 1000 } }))
  expect(used).toContain('aria-label="벽 설치"'); expect(used).toContain('loading="eager"')
  expect(used).toContain('aria-hidden="true"')
})
it('시청 배지는 실제 인원수를 읽기 쉬운 숫자와 접근성 상태로 표시한다', () => {
  const html = renderToStaticMarkup(createElement(GameSpectatorBadge, { count: 1200 }))
  expect(html).toContain('현재 관전자 1,200명'); expect(html).toContain('aria-live="polite"')
  expect(html).toContain('명 관전 중')
  expect(renderToStaticMarkup(createElement(GameSpectatorBadge, { count: 0 }))).toContain('현재 관전자 0명')
})
