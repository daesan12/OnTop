import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BangCard } from '../../src/game/bang/BangCard'
import { PlayerInfo } from '../../src/game/bang/PlayerInfo'
import { CARD_NAME, CARD_RULE, GAME_NAME, cardCategory } from '../../src/game/bang/presentation'
import { CARD_KINDS, type BangPlayer, type BangCard as Card } from '../../src/game/bang/protocol'

const card: Card = { id: 'b1', kind: 'BEER', suit: 'HEARTS', rank: 6 }
const player: BangPlayer = { userId: '1', role: null, character: 'SUZY_LAFAYETTE', hp: 2, maxHp: 4,
  active: true, forfeited: false, cardCount: 3, range: 1, equipment: [] }

describe('탑골 총잡이 정보와 한국어 카드 안내', () => {
  it('새 이름과 모든 카드 이름·사용 규칙을 한국어로 제공한다', () => {
    expect(GAME_NAME).toBe('탑골 총잡이')
    for (const kind of CARD_KINDS) {
      expect(CARD_NAME[kind]).toMatch(/^[가-힣 ]+$/)
      expect(CARD_RULE[kind].length).toBeGreaterThan(20)
      expect(cardCategory(kind)).toMatch(/^[가-힣 ]+$/)
    }
  })
  it('내 역할·승리 목표·능력·기본 무기·생명력을 같은 정보 영역에 표시한다', () => {
    const html = renderToStaticMarkup(createElement(PlayerInfo, { player, name: '나', own: true, ownRole: 'OUTLAW' }))
    for (const text of ['역할 · ', '무법자', '승리 목표', '보안관을 제거하세요', '수지 라파예트', '능력', '손패가 비면', '생명력', '기본 권총', '공격 사거리']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('생명력 2 / 4')
  })
  it('상대의 비공개 역할은 공개하지 않고 능력과 장착 무기는 표시한다', () => {
    const armed: BangPlayer = { ...player, range: 5, equipment: [{ ...card, kind: 'WINCHESTER' }] }
    const html = renderToStaticMarkup(createElement(PlayerInfo, { player: armed, name: '상대', ownRole: 'RENEGADE', distance: 2 }))
    expect(html).toContain('비공개')
    expect(html).not.toContain('배신자')
    expect(html).toContain('명사수 소총')
    expect(html).toContain('나와의 거리')
    expect(html).toContain('손패가 비면')
  })
  it('회복 카드는 사용 불가 상태에도 키보드로 읽고 설명을 확인할 수 있다', () => {
    const html = renderToStaticMarkup(createElement(BangCard, { card, disabled: true, onSelect: () => { throw new Error('미리보기 선택 금지') } }))
    expect(html).toContain('맥주')
    expect(html).toContain('회복 카드')
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain('disabled=""')
    expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/BEER|DUEL|BANG|뱅/)
  })
})
