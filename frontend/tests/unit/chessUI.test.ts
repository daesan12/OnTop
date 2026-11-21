import { beforeEach, describe, expect, it } from 'vitest'
import { syncChessUI, useChessUI } from '../../src/game/chess/ui'

describe('체스 HUD와 테이블의 공유 표시 상태', () => {
  beforeEach(() => syncChessUI('', -1, false, false))
  it('복구 중 두 번째 화면이 연결되어도 선택과 회전·탑뷰를 보존한다', () => {
    syncChessUI('game-1', 4, true, false)
    useChessUI.setState({ selected: 'e2', angle: .5, overhead: true })
    syncChessUI('game-1', 4, true, false)
    expect(useChessUI.getState()).toMatchObject({ selected: 'e2', angle: .5, overhead: true })
  })
  it('새 수와 둘러보기 전환은 선택만 취소하고 시점을 유지한다', () => {
    syncChessUI('game-2', 4, true, false)
    useChessUI.setState({ selected: 'e2', angle: .5, claimMode: true })
    syncChessUI('game-2', 5, true, false)
    expect(useChessUI.getState()).toMatchObject({ selected: '', claimMode: false, angle: .5 })
    useChessUI.setState({ selected: 'd2' })
    syncChessUI('game-2', 5, true, true)
    expect(useChessUI.getState()).toMatchObject({ selected: '', angle: .5, looking: true })
  })
  it('다음 경기는 이전 선택·승격·시점을 이어받지 않는다', () => {
    syncChessUI('game-3', 1, true, false)
    useChessUI.setState({ selected: 'e7', overhead: true, flip: true, keyboardOpen: true })
    syncChessUI('game-4', 1, true, false)
    expect(useChessUI.getState()).toMatchObject({ selected: '', promotion: [], overhead: false, flip: false, keyboardOpen: false })
  })
})
