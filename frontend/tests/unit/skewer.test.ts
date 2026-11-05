import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MS, ENDING_MS, GREETING_MS, INSERT_ALIGNMENT, INSERT_RADIUS, ORDER_MS, SERVING_Z, availablePieces, canServe, canThread, createDeck, formatTime, gameReducer, initialGame, matchesOrder, transitionText, validRecipe } from '../../src/features/skewer/game'
import type { GameCard, GameState, IngredientId, OrderCard } from '../../src/features/skewer/game'

const recipe: IngredientId[] = ['tomato', 'cheese', 'pepper', 'shrimp', 'cheese', 'bacon', 'beef', 'bacon']
const order: OrderCard = { kind: 'order', id: 'test-order', name: '테스트 주문', recipe, value: 3 }
const deck: GameCard[] = [order, { ...order, id: 'second', recipe: [...recipe].reverse() }, { kind: 'greeting', id: 'greeting' }, { kind: 'closing', id: 'closing' }]
const start = () => gameReducer(gameReducer(initialGame(deck), { type: 'start', now: 1000 - COUNTDOWN_MS }), { type: 'tick', now: 1000 })
const fill = (state: GameState, ids = recipe) => ids.reduce((current, ingredient) => gameReducer(current, { type: 'thread', ingredient, now: 2000 }), state)

describe('start and completion transitions', () => {
  it('shows 3, 2, 1 and start before beginning the full first-order timer', () => {
    const countdown = gameReducer(initialGame(deck), { type: 'start', now: 1000 })
    expect(countdown.phase).toBe('countdown')
    for (const [elapsed, label] of [[0, '3'], [1000, '2'], [2000, '1'], [3000, '시작!']] as const) {
      const state = gameReducer(countdown, { type: 'tick', now: 1000 + elapsed })
      expect(transitionText(state)).toBe(label)
      expect(gameReducer(state, { type: 'thread', ingredient: 'tomato', now: 1000 + elapsed }).skewer).toEqual([])
      expect(gameReducer(state, { type: 'submit', now: 1000 + elapsed }).rounds).toEqual([])
      expect(gameReducer(state, { type: 'start', now: 1000 + elapsed }).deadline).toBe(1000 + COUNTDOWN_MS)
    }
    // A delayed render still gives the first order its full time.
    expect(gameReducer(countdown, { type: 'tick', now: 10000 })).toMatchObject({ phase: 'playing', remainingMs: ORDER_MS, deadline: 10000 + ORDER_MS })
  })
  it('preserves countdown time across hidden-tab or headset pause and resume', () => {
    const countdown = gameReducer(initialGame(deck), { type: 'start', now: 0 })
    const paused = gameReducer(countdown, { type: 'pause', now: 1250 })
    expect(paused).toMatchObject({ phase: 'paused', pausedFrom: 'countdown', remainingMs: 2250, deadline: null })
    expect(gameReducer(paused, { type: 'tick', now: 50000 }).phase).toBe('paused')
    const resumed = gameReducer(paused, { type: 'resume', now: 50000 })
    expect(resumed).toMatchObject({ phase: 'countdown', remainingMs: 2250, deadline: 52250 })
    expect(transitionText(resumed)).toBe('2')
    expect(gameReducer(resumed, { type: 'tick', now: 52250 })).toMatchObject({ phase: 'playing', remainingMs: ORDER_MS })
  })
  it('locks settled scores during completion and only reveals results after its full duration', () => {
    const result = gameReducer(fill(start()), { type: 'submit', now: 3000 })
    const ending = gameReducer({ ...result, deck: [order, { kind: 'closing', id: 'closing' }] }, { type: 'next', now: 4000 })
    expect(transitionText(ending)).toBe('완료!')
    for (const type of ['submit', 'next', 'greet'] as const) {
      expect(gameReducer(ending, { type, now: 4100 })).toMatchObject({ phase: 'ending', score: 3, served: 1, rounds: result.rounds })
    }
    expect(gameReducer(ending, { type: 'tick', now: 4000 + ENDING_MS - 1 }).phase).toBe('ending')
    const paused = gameReducer(ending, { type: 'pause', now: 4100 })
    const resumed = gameReducer(paused, { type: 'resume', now: 9000 })
    expect(gameReducer(resumed, { type: 'tick', now: 9000 + ENDING_MS - 100 })).toMatchObject({ phase: 'finished', score: 3, rounds: result.rounds, deadline: null })
  })
})

describe('cube skewer assembly', () => {
  it('selection does not add ingredients; threading is a separate action', () => {
    const selected = gameReducer(start(), { type: 'select', ingredient: 'tomato', now: 2000 })
    expect(selected.pending).toBe('tomato')
    expect(selected.skewer).toEqual([])
    expect(gameReducer(selected, { type: 'cancel', now: 2100 }).pending).toBeNull()
  })
  it('provides only one block of each type, with no unlimited duplicates', () => {
    const first = fill(start(), ['tomato'])
    const duplicate = fill(first, ['tomato'])
    expect(duplicate.skewer).toEqual(['tomato'])
    expect(duplicate.feedback).toBe('error')
    expect(availablePieces(first.skewer, 'tomato')).toBe(0)
  })
  it('provides three independent cubes, rejects a fourth, and forbids single-cube completion', () => {
    const first = fill(start(), ['cheese', 'tomato'])
    expect(availablePieces(first.skewer, 'cheese')).toBe(2)
    expect(validRecipe(first.skewer)).toBe(false)
    const complete = fill(first, ['cheese'])
    expect(validRecipe(complete.skewer)).toBe(true)
    const triple = fill(complete, ['cheese'])
    expect(validRecipe(triple.skewer)).toBe(true)
    expect(fill(triple, ['cheese']).skewer).toEqual(triple.skewer)
  })
  it('checks cube positions, counts and every other ingredient', () => {
    expect(matchesOrder(recipe, recipe)).toBe(true)
    expect(matchesOrder(['tomato', 'pepper', 'cheese', 'shrimp', 'cheese', 'bacon', 'beef', 'bacon'], recipe)).toBe(false)
    expect(matchesOrder(recipe.filter(id => id !== 'cheese'), recipe)).toBe(false)
  })
  it('accepts a whole-skewer reversal without imposing artificial cube rotations', () => {
    expect(matchesOrder([...recipe].reverse(), recipe)).toBe(true)
  })
  it('requires two or three cubes of each used kind and rejects unknown ingredients', () => {
    expect(matchesOrder(['cheese', 'tomato'], ['cheese', 'tomato'])).toBe(false)
    expect(matchesOrder(['bacon'], ['bacon'])).toBe(false)
    expect(validRecipe(['cheese', 'cheese', 'cheese'])).toBe(true)
    expect(validRecipe(['cheese', 'cheese', 'cheese', 'cheese'])).toBe(false)
    expect(validRecipe(['bacon', 'bacon', 'bacon'])).toBe(true)
    expect(validRecipe(['bacon', 'bacon', 'bacon', 'bacon'])).toBe(false)
    expect(validRecipe(['mushroom'] as IngredientId[])).toBe(false)
    expect(validRecipe([])).toBe(false)
  })
  it('returns only the end piece and restores its inventory availability', () => {
    const full = fill(start())
    const undone = gameReducer(full, { type: 'unthread', now: 3000 })
    expect(undone.skewer).toEqual(recipe.slice(0, -1))
    expect(availablePieces(undone.skewer, 'bacon')).toBe(2)
    expect(availablePieces(undone.skewer, 'beef')).toBe(0)
  })
  it('awards menu value once, preserving the served skewer for retrieval next round', () => {
    const result = gameReducer(fill(start()), { type: 'submit', now: 3000 })
    expect(result).toMatchObject({ phase: 'result', score: 3, served: 1, skewer: recipe, deadline: null })
    expect(gameReducer(result, { type: 'submit', now: 3100 }).score).toBe(3)
    const next = gameReducer(result, { type: 'next', now: 4000 })
    expect(next.skewer).toEqual(recipe)
    expect(next.remainingMs).toBe(ORDER_MS)
  })
  it('locks an incorrectly served order instead of allowing unlimited retries', () => {
    const result = gameReducer(fill(start(), ['tomato']), { type: 'submit', now: 3000 })
    expect(result).toMatchObject({ phase: 'result', score: 0, mistakes: 1, feedback: 'error' })
    expect(gameReducer(result, { type: 'unthread', now: 3100 }).skewer).toEqual(['tomato'])
    expect(gameReducer(result, { type: 'submit', now: 3100 }).mistakes).toBe(1)
  })
  it('rejects service arriving exactly at or after the deadline before any tick', () => {
    for (const now of [1000 + ORDER_MS, 1000 + ORDER_MS + 20000]) {
      expect(gameReducer(fill(start()), { type: 'submit', now })).toMatchObject({ phase: 'result', remainingMs: 0, score: 0, mistakes: 1 })
    }
  })
  it('stops elapsed time on pause and resumes the same order', () => {
    const paused = gameReducer(start(), { type: 'pause', now: 6000 })
    expect(paused.remainingMs).toBe(30000)
    expect(gameReducer(paused, { type: 'thread', ingredient: 'tomato', now: 100000 }).skewer).toEqual([])
    const resumed = gameReducer(paused, { type: 'resume', now: 200000 })
    expect(resumed.deadline).toBe(230000)
    expect(gameReducer(resumed, { type: 'tick', now: 230000 }).phase).toBe('result')
  })
  it('handles greeting success once and closing-card settlement', () => {
    const greetingDeck: GameCard[] = [{ kind: 'greeting', id: 'g' }, { kind: 'closing', id: 'c' }]
    const greeting = gameReducer(gameReducer(initialGame(greetingDeck), { type: 'start', now: 1000 - COUNTDOWN_MS }), { type: 'tick', now: 1000 })
    expect(greeting.remainingMs).toBe(GREETING_MS)
    expect(fill(greeting, ['tomato']).skewer).toEqual([])
    const result = gameReducer(greeting, { type: 'greet', now: 2000 })
    expect(result).toMatchObject({ phase: 'result', score: 1 })
    expect(gameReducer(result, { type: 'greet', now: 2100 }).score).toBe(1)
    const ending = gameReducer(result, { type: 'next', now: 3000 })
    expect(ending).toMatchObject({ phase: 'ending', score: 1, deadline: 3000 + ENDING_MS })
    expect(gameReducer(ending, { type: 'tick', now: 3000 + ENDING_MS })).toMatchObject({ phase: 'finished', score: 1, deadline: null })
    expect(gameReducer(greeting, { type: 'greet', now: 4000 })).toMatchObject({ phase: 'result', score: 0, mistakes: 1 })
  })
  it('clears the board and all results only when restarting the entire game', () => {
    const result = gameReducer(fill(start()), { type: 'submit', now: 3000 })
    const fresh = gameReducer(result, { type: 'restart', deck, now: 900000 })
    expect(fresh).toMatchObject({ phase: 'countdown', score: 0, served: 0, mistakes: 0, cardIndex: 0, skewer: [], pending: null, deadline: 900000 + COUNTDOWN_MS })
    expect(gameReducer(fresh, { type: 'tick', now: 900000 + COUNTDOWN_MS })).toMatchObject({ phase: 'playing', remainingMs: ORDER_MS, deadline: 900000 + COUNTDOWN_MS + ORDER_MS })
  })
  it('generates only attainable menus and puts closing among the last five cards', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let next = seed
      const generated = createDeck(() => { next = (next * 1664525 + 1013904223) >>> 0; return next / 4294967296 })
      expect(generated).toHaveLength(15)
      expect(generated[0].kind).toBe('order')
      expect(generated.findIndex(card => card.kind === 'closing')).toBeGreaterThanOrEqual(10)
      const menus = generated.filter((card): card is OrderCard => card.kind === 'order')
      expect(menus).toHaveLength(12)
      expect(menus.every(card => validRecipe(card.recipe))).toBe(true)
      expect(menus.every(card => card.recipe.includes('cheese') || card.recipe.includes('bacon'))).toBe(true)
    }
  })
})

describe('VR insertion gating and display time', () => {
  it('requires putting the skewer horizontally above the serving plate', () => {
    expect(canServe({ x: 0, y: 0.98, z: SERVING_Z }, 0)).toBe(true)
    expect(canServe({ x: 0.8, y: 0.98, z: SERVING_Z }, 0)).toBe(false)
    expect(canServe({ x: 0, y: 1.4, z: SERVING_Z }, 0)).toBe(false)
    expect(canServe({ x: 0, y: 0.98, z: -0.55 }, 0)).toBe(false)
    expect(canServe({ x: 0, y: 0.98, z: SERVING_Z }, 0.9)).toBe(false)
  })
  it('requires proximity and correct axis alignment, in either axial direction', () => {
    expect(canThread(INSERT_RADIUS, INSERT_ALIGNMENT)).toBe(true)
    expect(canThread(0.01, -1)).toBe(true)
    expect(canThread(INSERT_RADIUS + 0.001, 1)).toBe(false)
    expect(canThread(0.01, INSERT_ALIGNMENT - 0.001)).toBe(false)
    expect(canThread(-1, 1)).toBe(false)
    expect(canThread(NaN, 1)).toBe(false)
    expect(canThread(0.01, Infinity)).toBe(false)
  })
  it('rounds the visible clock up and clamps negative display values', () => {
    expect(formatTime(35000)).toBe('00:35')
    expect(formatTime(1001)).toBe('00:02')
    expect(formatTime(1)).toBe('00:01')
    expect(formatTime(-1)).toBe('00:00')
  })
})
