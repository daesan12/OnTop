import { describe, expect, it } from 'vitest'
import { topJumpRopeEntries } from '../../src/jump-rope-preview/jumpRopeRankingData'

describe('jump rope ranking', () => {
  it('selects the ten highest scores without mutating the supplied records', () => {
    const scores = [920, 460, 1300, 910, 880, 1750, 1210, 1440, 920, 560, 970, 1540]
    const entries = Object.freeze(scores.map((score, index) => ({ nickname: `도전자 ${index + 1}`, score })))

    const top = topJumpRopeEntries(entries)

    expect(top.map(entry => entry.score)).toEqual([1750, 1540, 1440, 1300, 1210, 970, 920, 920, 910, 880])
    expect(top.filter(entry => entry.score === 920).map(entry => entry.nickname)).toEqual(['도전자 1', '도전자 9'])
    expect(entries.map(entry => entry.score)).toEqual(scores)
  })

  it('returns only the available records', () => {
    expect(topJumpRopeEntries([])).toEqual([])
    const record = { nickname: '공원단골', score: 45 }
    expect(topJumpRopeEntries([record])).toEqual([record])
  })
})
