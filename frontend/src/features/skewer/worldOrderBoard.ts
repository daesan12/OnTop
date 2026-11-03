import { currentCard, formatTime, pieceLabel, transitionText } from './game'
import type { GameState } from './game'
import { paintIngredient } from './ingredientArt'
import { assemblyGuide, gameSummary, nextInstruction, roundOutcome, recipeNotes } from './presentation'

/** Same labels and legal orientation as the desktop order rail, drawn at a
 * readable size on the existing world-space panel for headset-only play. */
export function paintWorldOrderBoard(ctx: CanvasRenderingContext2D, state: GameState, notice: string, entryFee?: number): void {
  const card = currentCard(state)
  ctx.clearRect(0, 0, 1024, 480)
  ctx.fillStyle = '#f5efe2'
  ctx.fillRect(0, 0, 1024, 480)
  const transition = transitionText(state)
  if (transition) {
    ctx.fillStyle = '#633806'
    ctx.textAlign = 'center'
    ctx.font = 'bold 150px "Malgun Gothic", sans-serif'
    ctx.fillText(transition, 512, 280)
    ctx.font = '30px "Malgun Gothic", sans-serif'
    ctx.fillText(state.phase === 'paused' ? '계속하기를 누르면 이어서 진행해요.' : transition === '완료!' ? '잠시 후 결과를 확인해요.' : '잠시 후 시작해요.', 512, 370)
    return
  }
  ctx.fillStyle = '#243b2e'
  ctx.textAlign = 'left'
  ctx.font = 'bold 40px "Malgun Gothic", sans-serif'
  const title = state.phase === 'ready' ? '온탑 꼬치왕' : state.phase === 'finished' ? '오늘의 영업을 마쳤어요'
    : state.phase === 'paused' ? '잠시 쉬어가세요' : state.phase === 'result' ? roundOutcome(state).title : card.kind === 'order' ? card.name : '손님이 왔어요!'
  ctx.fillText(title, 34, 57, 700)
  ctx.textAlign = 'right'
  ctx.font = 'bold 34px "Malgun Gothic", sans-serif'
  ctx.fillText(`${state.score}점${state.phase === 'playing' ? ` · ${formatTime(state.remainingMs)}` : ''}`, 990, 57)
  ctx.textAlign = 'left'
  ctx.font = '28px "Malgun Gothic", sans-serif'
  if (state.phase === 'ready') {
    ctx.fillText(`주문당 35초${entryFee ? ` · 한 판 이용료 ${entryFee}냥` : ''}`, 34, 130)
    ctx.fillText('1. 트리거로 음식 집기', 34, 200)
    ctx.fillText('2. 음식 중심과 꼬치 방향 맞추고 놓기', 34, 255)
    ctx.fillText('3. 완성하면 접시 뒤쪽에 수평으로 서빙', 34, 310)
    ctx.fillText(notice || '치즈·베이컨은 사용한다면 각각 2~3개를 꽂아요. 1개만 사용한 꼬치는 제출할 수 없어요.', 34, 395, 956)
    return
  }
  if (state.phase === 'finished') {
    const summary = gameSummary(state)
    ctx.font = 'bold 70px "Malgun Gothic", sans-serif'
    ctx.fillText(`최종 ${state.score}점`, 34, 165)
    ctx.font = '32px "Malgun Gothic", sans-serif'
    ctx.fillText(`완성 ${summary.completed}개 · 놓친 주문 ${summary.missed}개`, 34, 250)
    ctx.fillText(`주문 성공률 ${summary.accuracy}% · 인사 보너스 +${summary.bonus}점`, 34, 315)
    ctx.fillText(notice || (entryFee ? '새 판은 이용료 10냥이 필요해요. 처음 화면으로 돌아갈 수도 있어요.' : '다시 도전하거나 처음 화면으로 돌아갈 수 있어요.'), 34, 405, 956)
    return
  }
  if (card.kind === 'order') {
    const guide = assemblyGuide(state.skewer, card.recipe)
    const slot = 956 / guide.expected.length
    guide.expected.forEach((id, index) => {
      const x = 34 + index * slot
      ctx.fillStyle = index < guide.completed ? '#dfE7d0' : index === guide.next ? '#f2dac0' : '#eee5d5'
      ctx.beginPath(); ctx.roundRect(x, 87, slot - 7, 135, 9); ctx.fill()
      ctx.fillStyle = '#243b2e'
      ctx.font = 'bold 24px "Malgun Gothic", sans-serif'
      ctx.fillText(String(index + 1), x + 9, 117)
      ctx.save(); ctx.translate(x + slot / 2 - 24, 119); ctx.scale(1.12, 1.12); paintIngredient(ctx, id); ctx.restore()
      ctx.textAlign = 'center'; ctx.font = '22px "Malgun Gothic", sans-serif'
      ctx.fillText(pieceLabel(guide.expected, index), x + (slot - 7) / 2, 203, slot - 12)
      ctx.textAlign = 'left'
    })
    ctx.fillStyle = '#43563a'; ctx.font = '25px "Malgun Gothic", sans-serif'
    recipeNotes(guide.expected).forEach((text, index) => ctx.fillText(text, 34, 260 + index * 34, 956))
  }
  const instruction = state.phase === 'result' ? roundOutcome(state) : nextInstruction(state)
  const message = notice || `${instruction.title} · ${instruction.detail}`
  ctx.fillStyle = '#243b2e'; ctx.font = '27px "Malgun Gothic", sans-serif'
  let line = '', row = 0
  for (const char of message) {
    if (ctx.measureText(line + char).width > 950) { ctx.fillText(line, 34, 360 + row * 34); line = ''; row++ }
    if (row >= 3) break
    line += char
  }
  if (row < 3) ctx.fillText(line, 34, 360 + row * 34)
  if (card.kind === 'greeting' && state.phase === 'playing') {
    ctx.font = 'bold 54px "Malgun Gothic", sans-serif'
    ctx.fillText('어서 오세요!', 34, 190)
    ctx.font = '28px "Malgun Gothic", sans-serif'
    ctx.fillText('3초 안에 서빙 / 인사 버튼을 눌러주세요.', 34, 265)
  }
}
