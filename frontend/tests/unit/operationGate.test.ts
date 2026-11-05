import { describe, expect, it } from 'vitest'
import { useBungeoppang } from '../../src/features/bungeoppang/store'
import { bungeoppangGameplayActive } from '../../src/features/operation/parkGameplay'
import { unavailableServiceOperation } from '../../src/features/operation/serviceOperation'
import { operationPollUnavailable, operationRedirect } from '../../src/features/operation/useParkOperationGate'
import { cooperativeSkewerGameplayActive, soloSkewerGameplayActive } from '../../src/features/skewer/activity'

describe('park operation gate', () => {
  it('진행 중 판은 마무리하고 판이 끝나면 점검 화면으로 보낸다', () => {
    const status = unavailableServiceOperation()

    expect(operationRedirect(status, true)).toBeNull()
    expect(operationRedirect(status, false)).toBe(status)
    expect(operationRedirect({ ...status, mode: 'NORMAL' }, false)).toBeNull()
  })

  it('운영 상태 조회가 연속 세 번 실패한 경우에만 안전 차단한다', () => {
    expect(operationPollUnavailable(1)).toBe(false)
    expect(operationPollUnavailable(2)).toBe(false)
    expect(operationPollUnavailable(3)).toBe(true)
  })

  it('붕어빵 결과 화면은 끝난 판으로 보고 다시 시작할 기회를 주지 않는다', () => {
    const state = useBungeoppang.getState()

    expect(bungeoppangGameplayActive({ ...state, phase: 'play' })).toBe(true)
    expect(bungeoppangGameplayActive({ ...state, phase: 'ending' })).toBe(true)
    expect(bungeoppangGameplayActive({ ...state, phase: 'result' })).toBe(false)
  })

  it('1인 꼬치구이는 주문 결과까지 진행 중이고 최종 결과부터 종료로 본다', () => {
    expect(soloSkewerGameplayActive('ready', false)).toBe(false)
    expect(soloSkewerGameplayActive('countdown', false)).toBe(true)
    expect(soloSkewerGameplayActive('result', false)).toBe(true)
    expect(soloSkewerGameplayActive('finished', false)).toBe(false)
    expect(soloSkewerGameplayActive('ready', true)).toBe(true)
  })

  it('협동 꼬치구이 대기실은 진행 중 판이 아니고 카운트다운부터 진행 중이다', () => {
    expect(cooperativeSkewerGameplayActive()).toBe(false)
    expect(cooperativeSkewerGameplayActive('WAITING')).toBe(false)
    expect(cooperativeSkewerGameplayActive('COUNTDOWN')).toBe(true)
    expect(cooperativeSkewerGameplayActive('PLAYING')).toBe(true)
    expect(cooperativeSkewerGameplayActive('FINISHED')).toBe(false)
  })
})
