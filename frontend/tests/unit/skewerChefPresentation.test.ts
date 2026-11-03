import { describe, expect, it } from 'vitest'
import { ChefPreview, type ChefView } from '../../src/features/skewer/chef/model'
import { chefPresentation } from '../../src/features/skewer/chef/chefPresentation'

describe('PC·VR 공통 요리 안내', () => {
  it('미전달 상태에서는 레시피 안내와 제출 완료 표시를 만들지 않는다', () => {
    const model = new ChefPreview(); model.clearIncoming()
    const p = chefPresentation(model.view())
    expect(p.guide).toBeNull(); expect(p.submitReady).toBe(false); expect(p.title).toContain('기다리고')
  })
  it('역방향 조립의 다음 큐브를 안내하고 완성 후 테이블 번호로 제출한다', () => {
    const model = new ChefPreview(), recipe = [...model.view().visible[0].recipe].reverse()
    for (const ingredient of recipe.slice(0, 4)) model.action({ type: 'thread', ingredient })
    const p = chefPresentation(model.view())
    expect(p.guide?.reversed).toBe(true); expect(p.title).toBe('다음은 치즈')
    for (const ingredient of recipe.slice(4)) model.action({ type: 'thread', ingredient })
    expect(chefPresentation(model.view()).submitReady).toBe(true)
    expect(chefPresentation(model.view()).submitLabel).toBe('01번 접시 제출')
  })
  it('잘못 꽂은 위치와 전달대 가득 참을 구분하고 수령 후 다시 제출을 안내한다', () => {
    const model = new ChefPreview()
    model.action({ type: 'thread', ingredient: 'shrimp' })
    expect(chefPresentation(model.view()).tone).toBe('warning')
    expect(chefPresentation(model.view()).guide?.completed).toBe(0)
    model.action({ type: 'unthread' })
    for (let n = 0; n < 3; n++) {
      for (const ingredient of model.view().visible[0].recipe) model.action({ type: 'thread', ingredient })
      if (n < 2) model.action({ type: 'submit' })
    }
    expect(chefPresentation(model.view()).title).toBe('전달대가 가득 찼어요')
    expect(chefPresentation(model.view()).submitReady).toBe(false)
    model.action({ type: 'pickup' }); expect(chefPresentation(model.view()).submitReady).toBe(true)
  })
  it('완성 상태여도 공동 일시정지·인사·종료 중에는 제출 가능으로 표시하지 않는다', () => {
    const model = new ChefPreview()
    for (const ingredient of model.view().visible[0].recipe) model.action({ type: 'thread', ingredient })
    const cooperative: NonNullable<ChefView['cooperative']> = { phase: 'PLAYING', greeting: false, answered: false, speech: false, countdown: 0, paused: false }
    for (const state of [{ ...cooperative, paused: true }, { ...cooperative, greeting: true }, { ...cooperative, phase: 'FINISHED' }]) {
      const p = chefPresentation({ ...model.view(), cooperative: state })
      expect(p.blocked).toBe(true); expect(p.submitReady).toBe(false)
    }
  })
})
