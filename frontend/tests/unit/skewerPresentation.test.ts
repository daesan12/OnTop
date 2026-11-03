import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MS, ENDING_MS, ORDER_MS, gameReducer, initialGame } from '../../src/features/skewer/game'
import type { GameCard, GameState, IngredientId } from '../../src/features/skewer/game'
import { assemblyGuide, gameSummary, nextInstruction, nextRoundLabel, roundOutcome, recipeNotes } from '../../src/features/skewer/presentation'

const recipe: IngredientId[] = ['tomato', 'cheese', 'pepper', 'shrimp', 'cheese', 'beef']
const deck: GameCard[] = [{ kind: 'order', id: 'o', name: '치즈 사이로', recipe, value: 2 }, { kind: 'greeting', id: 'g' }, { kind: 'closing', id: 'c' }]
const start = () => gameReducer(gameReducer(initialGame(deck), { type: 'start', now: -COUNTDOWN_MS }), { type: 'tick', now: 0 })
const thread = (state: GameState, ids: IngredientId[]) => ids.reduce((state, ingredient) => gameReducer(state, { type: 'thread', ingredient, now: 10 }), state)

describe('order guidance and lifecycle results', () => {
  it('guides a reversed assembly without marking it wrong', () => {
    const reverse = [...recipe].reverse()
    expect(assemblyGuide(reverse.slice(0, 3), recipe)).toMatchObject({ reversed: true, completed: 3, mismatch: false, next: 3 })
    expect(assemblyGuide(reverse, recipe)).toMatchObject({ complete: true, completed: 6, next: null })
    expect(nextInstruction(thread(start(), reverse)).title).toBe('꼬치가 완성됐어요')
  })
  it('does not count a mismatched tail as completed', () => {
    const state = thread(start(), ['tomato', 'shrimp'])
    expect(assemblyGuide(state.skewer, recipe)).toMatchObject({ completed: 1, mismatch: true, next: 1 })
    expect(nextInstruction(state).detail).toContain('2번째')
  })
  it('describes independent cube counts in plain Korean', () => {
    expect(recipeNotes(recipe)).toEqual(['치즈 큐브 2개'])
    expect(recipeNotes(['bacon', 'pepper', 'bacon'])).toEqual(['베이컨 큐브 2개'])
    expect(recipeNotes(['cheese', 'cheese', 'tomato'])).toEqual(['치즈 큐브 2개'])
  })
  it('distinguishes timeouts, missing cubes and wrong order', () => {
    const timeout = gameReducer(start(), { type: 'tick', now: ORDER_MS })
    expect(roundOutcome(timeout).title).toBe('시간이 다 됐어요')
    const serve = (ids: IngredientId[]) => gameReducer(thread(start(), ids), { type: 'submit', now: 30 })
    expect(roundOutcome(serve(['tomato', 'cheese'])).title).toBe('조금 더 꽂아야 해요')
    expect(roundOutcome(serve(['tomato'])).title).toBe('조금 더 꽂아야 해요')
    expect(roundOutcome(serve(['tomato', 'shrimp'])).detail).toContain('2번째는 치즈')
  })
  it('records each settled round once and keeps greeting bonus out of order totals', () => {
    let state = gameReducer(thread(start(), recipe), { type: 'submit', now: 20 })
    state = gameReducer(state, { type: 'submit', now: 21 })
    expect(state.rounds).toHaveLength(1)
    expect(nextRoundLabel(state)).toBe('손님 맞이하기')
    state = gameReducer(state, { type: 'next', now: 30 })
    state = gameReducer(state, { type: 'greet', now: 40 })
    state = gameReducer(state, { type: 'greet', now: 41 })
    expect(nextRoundLabel(state)).toBe('최종 결과 보기')
    state = gameReducer(state, { type: 'next', now: 50 })
    expect(state.phase).toBe('ending')
    state = gameReducer(state, { type: 'tick', now: 50 + ENDING_MS })
    expect(state.phase).toBe('finished')
    expect(state.score).toBe(3)
    expect(gameSummary(state)).toMatchObject({ completed: 1, missed: 0, attempted: 1, accuracy: 100, bonus: 1 })
  })
  it('records timed-out greetings without calling them missed orders', () => {
    let state = gameReducer(start(), { type: 'tick', now: ORDER_MS })
    state = gameReducer(state, { type: 'next', now: ORDER_MS + 1 })
    state = gameReducer(state, { type: 'tick', now: ORDER_MS + 4000 })
    expect(gameSummary(state)).toMatchObject({ completed: 0, missed: 1, attempted: 1, bonus: 0 })
    expect(state.rounds).toHaveLength(2)
  })
  it('returns home with fresh data and a stopped timer; restart starts a new game', () => {
    const played = gameReducer(thread(start(), recipe), { type: 'submit', now: 20 })
    const home = gameReducer(played, { type: 'home', deck, now: 30 })
    expect(home).toMatchObject({ phase: 'ready', score: 0, rounds: [], skewer: [], deadline: null })
    expect(gameSummary(home).accuracy).toBe(0)
    expect(gameReducer(home, { type: 'restart', deck, now: 40 })).toMatchObject({ phase: 'countdown', deadline: COUNTDOWN_MS + 40 })
  })
})
