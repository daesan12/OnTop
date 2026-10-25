import { describe, expect, it } from 'vitest'
import { filterChat } from '../../src/features/chat/filterChat'

describe('prototype chat masking on send and approved display', () => {
  it.each(['씨발', '씨.발', '시1발', '병  신', '개새끼', 'ㅅㅂ', 'ㅅ . ㅂ', '씨\u200b발', '씨발'.normalize('NFD'),
    'FUCK', 'f.u.c.k', 'ＦＵＣＫ', 'fucking', 'motherfucker', 'SHIT', 'asshole'])('masks %s', value => {
    expect(filterChat(value)).toBe('**')
  })
  it.each(['ㅎㅇ  ㅎㅇ', '새끼 고양이', '시발점과 시발역', '십팔 번 버스', 'class assignment', 'Scunthorpe',
    'shuttle', '푸시 알림 발송', '🙂 좋은 수네요!', '<b>일반 텍스트</b>'])('preserves %s', value => {
    expect(filterChat(value)).toBe(value)
  })
  it('preserves spacing and emoji, merging overlapping matches and leaving already masked content unchanged', () => {
    expect(filterChat('🌳  씨발! 😂 ＦＵＣＫ?')).toBe('🌳  **! 😂 **?')
    expect(filterChat('씨발씨발 병신')).toBe('**** **')
    expect(filterChat('** **!')).toBe('** **!')
  })
})
