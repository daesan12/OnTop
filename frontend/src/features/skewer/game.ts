export const INGREDIENTS = [
  { id: 'tomato', name: '방울토마토', color: '#c74530', key: '1', limit: 1 },
  { id: 'pepper', name: '피망', color: '#618446', key: '2', limit: 1 },
  { id: 'shrimp', name: '새우', color: '#df936f', key: '3', limit: 1 },
  { id: 'beef', name: '고기', color: '#985747', key: '4', limit: 1 },
  { id: 'cheese', name: '치즈', color: '#d4ad40', key: '5', limit: 3 },
  { id: 'bacon', name: '베이컨', color: '#bf7580', key: '6', limit: 3 },
] as const

export type IngredientId = typeof INGREDIENTS[number]['id']
export type Phase = 'ready' | 'countdown' | 'playing' | 'paused' | 'result' | 'ending' | 'finished'
// Match the bungeoppang intro (3, 2, 1, start) and closing beat.
export const COUNTDOWN_MS = 3_500
export const ENDING_MS = 1_100
export const ORDER_MS = 35_000
export const GREETING_MS = 3_000
export const INSERT_RADIUS = 0.065
export const INSERT_ALIGNMENT = Math.cos(Math.PI / 9)
export const SKEWER_TIP = { x: 0.7, y: 0.972, z: -0.55 } as const
export const SERVING_Z = -0.82

export interface OrderCard {
  kind: 'order'
  id: string
  name: string
  recipe: IngredientId[]
  value: number
}
export type GameCard = OrderCard | { kind: 'greeting' | 'closing'; id: string }
export interface RoundResult {
  cardId: string
  kind: 'order' | 'greeting'
  name: string
  success: boolean
  points: number
  reason: 'served' | 'wrong-order' | 'timeout' | 'greeted'
}
export interface GameState {
  phase: Phase
  pausedFrom: 'countdown' | 'playing' | 'ending' | null
  deck: GameCard[]
  cardIndex: number
  skewer: IngredientId[]
  pending: IngredientId | null
  score: number
  served: number
  mistakes: number
  remainingMs: number
  deadline: number | null
  message: string
  feedback: 'neutral' | 'success' | 'error'
  rounds: RoundResult[]
}
export type GameAction =
  | { type: 'start' | 'pause' | 'resume' | 'tick' | 'unthread' | 'cancel' | 'submit' | 'next' | 'greet'; now: number }
  | { type: 'restart' | 'home'; now: number; deck: GameCard[] }
  | { type: 'select' | 'thread'; ingredient: IngredientId; now: number }

export function ingredientName(id: IngredientId): string { return INGREDIENTS.find(item => item.id === id)!.name }
export function currentCard(state: GameState): GameCard { return state.deck[state.cardIndex] }
export function availablePieces(skewer: readonly IngredientId[], id: IngredientId): number {
  return INGREDIENTS.find(item => item.id === id)!.limit - skewer.filter(item => item === id).length
}
export function pieceLabel(ids: readonly IngredientId[], index: number): string {
  return ingredientName(ids[index])
}
export function validAssembly(ids: readonly IngredientId[]): boolean {
  return ids.length > 0 && ids.every(id => INGREDIENTS.some(item => item.id === id))
    && INGREDIENTS.every(item => ids.filter(id => id === item.id).length <= item.limit)
}
// 조립 중에는 한 개도 가능하지만 완성 주문에는 큐브를 2~3개 사용한다.
export function validRecipe(ids: readonly IngredientId[]): boolean {
  return validAssembly(ids) && ['cheese', 'bacon'].every(cube => ids.filter(id => id === cube).length !== 1)
}
// A whole-skewer reversal is valid, rather than imposing a false orientation rule.
export function matchesOrder(skewer: readonly IngredientId[], order: readonly IngredientId[]): boolean {
  if (!validRecipe(skewer) || skewer.length !== order.length) return false
  return skewer.every((id, index) => id === order[index])
    || skewer.every((id, index) => id === order[order.length - 1 - index])
}
export function canThread(distance: number, axisAlignment: number): boolean {
  return Number.isFinite(distance) && distance >= 0 && distance <= INSERT_RADIUS
    && Number.isFinite(axisAlignment) && Math.abs(axisAlignment) >= INSERT_ALIGNMENT
}
export function canServe(position: { x: number; y: number; z: number }, verticalAxis: number): boolean {
  return Math.abs(position.x) < 0.55 && position.y > 0.88 && position.y < 1.14
    && Math.abs(position.z - SERVING_Z) < 0.16 && Number.isFinite(verticalAxis) && Math.abs(verticalAxis) < 0.35
}
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
/** Original assembly mechanics, independently generated menus.
 * Service deadlines and greeting reward adapt the multiplayer race for 1P. */
export function createDeck(random: () => number = Math.random): GameCard[] {
  const orders: OrderCard[] = Array.from({ length: 12 }, (_, index) => {
    const [a, b, c, d] = shuffle<IngredientId>(['tomato', 'pepper', 'shrimp', 'beef'], random)
    const recipes: IngredientId[][] = [
      [a, 'cheese', b, c, 'cheese', d],
      ['bacon', a, b, 'bacon', c, d],
      ['cheese', a, 'bacon', b, c, 'cheese', d, 'bacon'],
      ['bacon', a, 'cheese', b, c, 'cheese', d, 'bacon'],
      [a, 'cheese', 'cheese', b, 'bacon', c, 'cheese', d, 'bacon'],
      ['cheese', 'bacon', a, b, 'bacon', c, d, 'bacon', 'cheese'],
    ]
    const variant = index % recipes.length
    return { kind: 'order', id: `order-${index}`, name: ['치즈 큐브 꼬치', '베이컨 큐브 꼬치', '모둠 큐브 꼬치', '더블 큐브 꼬치', '치즈 듬뿍 꼬치', '스페셜 모둠 꼬치'][variant],
      recipe: recipes[variant], value: variant < 2 ? 2 : 3 }
  })
  const mixed = shuffle(orders, random)
  const deck: GameCard[] = [...mixed.slice(0, 3), { kind: 'greeting', id: 'greeting-1' },
    ...mixed.slice(3, 8), { kind: 'greeting', id: 'greeting-2' }, ...mixed.slice(8)]
  deck.splice(deck.length - 4 + Math.floor(random() * 5), 0, { kind: 'closing', id: 'closing' })
  return deck
}
export function initialGame(deck: GameCard[] = createDeck()): GameState {
  return { phase: 'ready', pausedFrom: null, deck, cardIndex: 0, skewer: [], pending: null, score: 0, served: 0, mistakes: 0,
    remainingMs: ORDER_MS, deadline: null, message: '음식을 순서대로 꽂아 주문을 완성하세요. 치즈·베이컨 큐브는 사용한다면 각각 2~3개를 꽂아 주세요.', feedback: 'neutral', rounds: [] }
}
function reveal(state: GameState, index: number, now: number): GameState {
  const card = state.deck[index]
  if (!card || card.kind === 'closing') {
    return { ...state, cardIndex: Math.min(index, state.deck.length - 1), phase: 'ending', pending: null, deadline: now + ENDING_MS,
      remainingMs: ENDING_MS, message: '완료!', feedback: 'neutral' }
  }
  const remainingMs = card.kind === 'greeting' ? GREETING_MS : ORDER_MS
  return { ...state, cardIndex: index, phase: 'playing', pending: null, remainingMs, deadline: now + remainingMs,
    message: card.kind === 'greeting' ? '어서 옵쇼! 3초 안에 인사 버튼을 누르세요.' : '모든 재료의 순서와 개수를 맞추세요. 이전 꼬치는 끝에서부터 빼서 다시 사용합니다.', feedback: 'neutral' }
}
function begin(state: GameState, now: number): GameState {
  return { ...state, phase: 'countdown', remainingMs: COUNTDOWN_MS, deadline: now + COUNTDOWN_MS, message: '잠시 후 시작해요.' }
}
export function transitionText(state: GameState): string {
  const phase = state.phase === 'paused' ? state.pausedFrom : state.phase
  if (phase === 'ending') return '완료!'
  if (phase !== 'countdown') return ''
  return state.remainingMs > 2500 ? '3' : state.remainingMs > 1500 ? '2' : state.remainingMs > 500 ? '1' : '시작!'
}
export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'home') return initialGame(action.deck)
  if (action.type === 'restart') return begin(initialGame(action.deck), action.now)
  const timed = state.phase === 'playing' || state.phase === 'countdown' || state.phase === 'ending'
  const remainingMs = timed && state.deadline !== null
    ? Math.max(0, state.deadline - action.now) : state.remainingMs
  if (state.phase === 'countdown' && remainingMs === 0) return reveal(state, 0, action.now)
  if (state.phase === 'ending' && remainingMs === 0) return { ...state, phase: 'finished', remainingMs: 0, deadline: null, message: `영업 종료! ${state.served}개 서빙 · 매출 ${state.score}점` }
  if (state.phase === 'playing' && remainingMs === 0) {
    const card = currentCard(state)
    return { ...state, phase: 'result', pending: null, mistakes: state.mistakes + 1, remainingMs: 0, deadline: null,
      rounds: card.kind === 'closing' ? state.rounds : [...state.rounds, { cardId: card.id, kind: card.kind, name: card.kind === 'order' ? card.name : '손님 인사', success: false, points: 0, reason: 'timeout' }],
      message: card.kind === 'greeting' ? '손님이 지나갔어요. 다음 손님을 맞이해볼까요?' : '시간이 다 됐어요. 다음 주문에서 다시 도전해보세요.', feedback: 'error' }
  }
  const current = remainingMs === state.remainingMs ? state : { ...state, remainingMs }
  if (action.type === 'start') return current.phase === 'ready' ? begin(current, action.now) : current
  if (action.type === 'next') return current.phase === 'result' ? reveal(current, current.cardIndex + 1, action.now) : current
  if (action.type === 'pause') return current.phase === 'playing' || current.phase === 'countdown' || current.phase === 'ending'
    ? { ...current, phase: 'paused', pausedFrom: current.phase, pending: null, deadline: null, message: '시간을 멈췄습니다. 계속하기를 눌러 재개하세요.' } : current
  if (action.type === 'resume') return current.phase === 'paused'
    ? { ...current, phase: current.pausedFrom ?? 'playing', pausedFrom: null, deadline: action.now + remainingMs, message: '준비되면 이어서 진행해요.', feedback: 'neutral' } : current
  if (action.type === 'tick' || current.phase !== 'playing') return current
  const card = currentCard(current)
  if (action.type === 'greet') return card.kind === 'greeting'
    ? { ...current, phase: 'result', score: current.score + 1, deadline: null, pending: null,
      rounds: [...current.rounds, { cardId: card.id, kind: 'greeting', name: '손님 인사', success: true, points: 1, reason: 'greeted' }],
      message: '어서 옵쇼! 인사 성공 · 1인 도전 보너스 +1점', feedback: 'success' } : current
  if (card.kind !== 'order') return current
  switch (action.type) {
    case 'select':
      if (availablePieces(current.skewer, action.ingredient) <= 0) return { ...current, message: '이미 사용 중인 재료입니다. 꼬치 끝에서부터 빼서 돌려놓으세요.', feedback: 'error' }
      return { ...current, pending: action.ingredient, message: `${ingredientName(action.ingredient)} 선택 · 꼬치 끝에 끼우세요.`, feedback: 'neutral' }
    case 'thread': {
      const id = action.ingredient
      if (availablePieces(current.skewer, id) <= 0) return { ...current, pending: null, message: '이 재료는 모두 사용 중입니다.', feedback: 'error' }
      const skewer = [...current.skewer, id]
      return { ...current, skewer, pending: null, message: `${pieceLabel(skewer, skewer.length - 1)} 끼우기 완료`, feedback: 'neutral' }
    }
    case 'cancel': return { ...current, pending: null, message: '선택한 재료를 돌려놓았습니다.', feedback: 'neutral' }
    case 'unthread': return { ...current, skewer: current.skewer.slice(0, -1), pending: null,
      message: current.skewer.length ? `${pieceLabel(current.skewer, current.skewer.length - 1)} 반환 · 끝에서부터 한 개씩만 뺄 수 있어요.` : '빈 꼬치입니다.', feedback: 'neutral' }
    case 'submit': {
      const correct = matchesOrder(current.skewer, card.recipe)
      return { ...current, phase: 'result', deadline: null, pending: null, score: current.score + (correct ? card.value : 0),
        rounds: [...current.rounds, { cardId: card.id, kind: 'order', name: card.name, success: correct, points: correct ? card.value : 0, reason: correct ? 'served' : 'wrong-order' }],
        served: current.served + (correct ? 1 : 0), mistakes: current.mistakes + (correct ? 0 : 1),
        message: correct ? `맛있게 드세요! 매출 +${card.value}점 · 꼬치를 회수하고 다음 주문을 준비하세요.`
          : '주문과 다른 꼬치예요. 재료 순서와 개수를 함께 확인해보세요.', feedback: correct ? 'success' : 'error' }
    }
    default: return current
  }
}
export function formatTime(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
