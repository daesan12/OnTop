import { describe, expect, it } from 'vitest'
import { nextSurvivor, survivorView } from '../../src/game/stone-rumble/spectating'

describe('돌탑 생존자 관전', () => {
  const players = [
    { userId: '101', alive: false }, { userId: '202', alive: true },
    { userId: '303', alive: false }, { userId: '404', alive: true },
  ]
  it('탈락자를 건너뛰고 앞뒤로 순환한다', () => {
    expect(nextSurvivor(players, '101')).toBe('202')
    expect(nextSurvivor(players, '202')).toBe('404')
    expect(nextSurvivor(players, '404')).toBe('202')
    expect(nextSurvivor(players, '202', -1)).toBe('404')
  })
  it('선택한 생존자를 유지하고 그 사람이 탈락하면 다음 생존자를 선택한다', () => {
    expect(survivorView(players, '404')).toBe('404')
    expect(survivorView(players.map(p => ({ ...p, alive: p.userId === '202' })), '404')).toBe('202')
  })
  it('관전자에게 첫 생존자를 보여주고 전원 탈락 시 대상이 없다', () => {
    expect(survivorView(players, null)).toBe('202')
    expect(survivorView(players.map(p => ({ ...p, alive: false })), '202')).toBeNull()
  })
})
