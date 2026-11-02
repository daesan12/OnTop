import { currentCard, fabricSpans, ingredientName, matchesOrder, pieceLabel } from './game'
import type { GameState, IngredientId } from './game'

const prefixLength = (actual: readonly IngredientId[], expected: readonly IngredientId[]) => {
  let count = 0
  while (count < actual.length && count < expected.length && actual[count] === expected[count]) count++
  return count
}
const hasFinalConsonant = (text: string) => (text.charCodeAt(text.length - 1) - 0xac00) % 28 !== 0

/** Show the closest legal orientation, so a correct reversed skewer stays valid
 * in the guide as well as in the scoring rules. Never modify the order itself. */
export function assemblyGuide(actual: readonly IngredientId[], recipe: readonly IngredientId[]) {
  const reverse = [...recipe].reverse()
  const forwardCount = prefixLength(actual, recipe)
  const reverseCount = prefixLength(actual, reverse)
  const expected = reverseCount > forwardCount ? reverse : [...recipe]
  const completed = Math.max(forwardCount, reverseCount)
  return { expected, completed, reversed: reverseCount > forwardCount,
    mismatch: completed < actual.length, complete: matchesOrder(actual, recipe),
    next: completed < expected.length ? completed : null }
}

export function wrapDescriptions(recipe: readonly IngredientId[]): string[] {
  return fabricSpans(recipe).map(span => {
    const inside = recipe.slice(span.start + 1, span.end ?? recipe.length).filter(id => id !== 'cheese' && id !== 'bacon')
    const names = inside.map(ingredientName).join('·')
    return inside.length
      ? `${span.id === 'bacon' ? '베이컨으로' : '치즈로'} ${names}${hasFinalConsonant(names) ? '을' : '를'} 감싸주세요.`
      : `${ingredientName(span.id)}는 접어서 앞끝과 뒤끝을 연달아 꽂아요.`
  })
}

export function nextInstruction(state: GameState) {
  const card = currentCard(state)
  if (card.kind !== 'order') return { title: '손님을 맞이해주세요', detail: '3초 안에 인사하면 보너스 1점!' }
  const guide = assemblyGuide(state.skewer, card.recipe)
  if (guide.complete) return { title: '꼬치가 완성됐어요', detail: '서빙하기를 눌러 주문을 마무리하세요.' }
  if (guide.mismatch) return { title: '순서를 한 번 확인해볼까요?', detail: `${guide.completed + 1}번째가 달라요. 끝 재료부터 빼서 다시 꽂을 수 있어요.` }
  const index = guide.next!
  const id = guide.expected[index]
  const label = pieceLabel(guide.expected, index)
  const span = fabricSpans(guide.expected).find(span => span.id === id)
  const detail = span && span.start === index
    ? wrapDescriptions(guide.expected).find(text => text.startsWith(ingredientName(id)))!
    : span ? '이제 뒤끝을 꽂아 음식들을 감싸주세요.' : '재료를 집어 꼬치 오른쪽 끝에 꽂아주세요.'
  return { title: `다음은 ${label}`, detail }
}

export function roundOutcome(state: GameState) {
  const card = currentCard(state)
  const record = state.rounds.at(-1)
  if (state.feedback === 'success') return { title: card.kind === 'greeting' ? '반갑게 맞이했어요!' : '맛있게 완성했어요!', detail: card.kind === 'greeting' ? '손님 인사 보너스 +1점' : `주문대로 만든 꼬치예요. +${card.kind === 'order' ? card.value : 0}점`, success: true }
  if (record?.reason === 'timeout' || state.remainingMs === 0) return { title: card.kind === 'greeting' ? '손님이 지나갔어요' : '시간이 다 됐어요', detail: card.kind === 'greeting' ? '다음 손님을 반갑게 맞이해보세요.' : '완성하지 못한 꼬치는 그대로 남아요. 다음 주문에서 다시 도전해보세요.', success: false }
  if (card.kind !== 'order') return { title: '다음 손님을 기다려볼까요?', detail: '', success: false }
  const guide = assemblyGuide(state.skewer, card.recipe)
  const open = fabricSpans(state.skewer).find(span => span.end === null)
  if (open) return { title: '감싸기를 마무리해 주세요', detail: `${ingredientName(open.id)}의 뒤끝이 아직 꽂히지 않았어요. 앞끝과 뒤끝이 모두 있어야 완성돼요.`, success: false }
  if (!guide.mismatch && state.skewer.length < guide.expected.length) return { title: '조금 더 꽂아야 해요', detail: `아직 ${guide.expected.length - state.skewer.length}단계가 남았어요. 완성 예시와 내 꼬치를 비교해보세요.`, success: false }
  const index = guide.completed
  const expectedLabel = index < guide.expected.length ? pieceLabel(guide.expected, index) : ''
  const actualLabel = index < state.skewer.length ? pieceLabel(state.skewer, index) : ''
  return { title: '주문과 순서가 달라요', detail: index < guide.expected.length
    ? `${index + 1}번째는 ${expectedLabel}${hasFinalConsonant(expectedLabel) ? '이에요' : '예요'}. 내 꼬치에는 ${actualLabel}${hasFinalConsonant(actualLabel) ? '이' : '가'} 꽂혀 있어요.`
    : '주문에 없는 재료가 더 꽂혀 있어요. 감싼 위치와 재료 수를 확인해보세요.', success: false }
}

export function gameSummary(state: GameState) {
  const orders = state.rounds.filter(round => round.kind === 'order')
  const completed = orders.filter(round => round.success).length
  const bonus = state.rounds.filter(round => round.kind === 'greeting').reduce((sum, round) => sum + round.points, 0)
  return { completed, missed: orders.length - completed, attempted: orders.length, bonus,
    accuracy: orders.length ? Math.round(completed / orders.length * 100) : 0,
    title: completed === 0 ? '오늘의 도전, 수고했어요' : completed >= 8 ? '손끝에서 탄생한 달인의 꼬치!' : '맛있는 도전을 마쳤어요' }
}

export function nextRoundLabel(state: GameState) {
  const next = state.deck[state.cardIndex + 1]
  return !next || next.kind === 'closing' ? '최종 결과 보기' : next.kind === 'greeting' ? '손님 맞이하기' : '다음 주문 받기'
}
