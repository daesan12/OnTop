import { paintGuidePaper, paintGuideButton, paintGuideNotePaper, TOUCH_GUIDE_COLORS } from '../../vrGuide/touchControllerGuide'

export type ChefPauseState = { open: boolean; busy: boolean; confirmed: boolean; error: string }
export const CLOSED_PAUSE: ChefPauseState = { open: false, busy: false, confirmed: false, error: '' }
export const PAUSE_BUTTONS = [
  { action: 'resume', label: '계속하기', x: 80, y: 742, width: 650, height: 144 },
  { action: 'leave', label: '나가기', x: 806, y: 742, width: 650, height: 144 },
  { action: 'pauseRetry', label: '일시정지 다시 시도', x: 400, y: 600, width: 736, height: 100 },
] as const

/** 세션 진입·입력 소스 교체·포커스 복구 후 B를 한 번 놓아야 다시 누를 수 있다. */
export class VRPauseButton {
  private source: XRInputSource | null = null
  private armed = false
  reset() { this.source = null; this.armed = false }
  update(source: XRInputSource | null, visible: boolean) {
    if (source !== this.source || !visible) { this.source = source; this.armed = false }
    if (!source || !visible) return false
    const pressed = !!source.gamepad?.buttons[5]?.pressed
    if (!pressed) { this.armed = true; return false }
    if (!this.armed) return false
    this.armed = false
    return true
  }
}

export function paintVRPause(ctx: CanvasRenderingContext2D, state: ChefPauseState, paper?: HTMLImageElement) {
  paintGuidePaper(ctx, 1024, paper)
  const { ink, muted } = TOUCH_GUIDE_COLORS
  ctx.fillStyle = ink; ctx.fillRect(714, 68, 34, 74); ctx.fillRect(788, 68, 34, 74)
  ctx.textAlign = 'center'; ctx.font = '700 66px "Malgun Gothic",sans-serif'
  ctx.fillText('잠깐 쉬어가기', 768, 244)
  ctx.font = '700 42px "Malgun Gothic",sans-serif'
  ctx.fillText(state.busy ? '요청을 확인하고 있어요…' : state.confirmed ? '게임이 함께 멈췄어요' : '일시정지를 확인하지 못했어요', 768, 330)
  ctx.fillStyle = muted; ctx.font = '36px "Malgun Gothic",sans-serif'
  ctx.fillText('나가면 친구의 경기도 함께 끝나요.', 768, 416)
  ctx.fillText('이어서 하려면 계속하기를 선택해 주세요.', 768, 470)
  if (state.error) {
    ctx.fillStyle = '#963e2e'; ctx.font = '700 30px "Malgun Gothic",sans-serif'
    const lines = state.error.match(/.{1,36}/gu) ?? []
    lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, 768, 530 + i * 40, 1336))
  }
  ctx.save(); if (state.busy) ctx.globalAlpha = .45
  for (const button of PAUSE_BUTTONS) {
    if (button.action === 'pauseRetry' && (state.busy || state.confirmed)) continue
    paintGuideButton(ctx, button.x, button.y, button.width, button.height, button.label, state.busy)
  }
  ctx.restore()
  paintGuideNotePaper(ctx, 918)
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = '34px "Malgun Gothic",sans-serif'
  ctx.fillText('검지 트리거로 선택 · 오른손 B로 계속하기', 768, 957)
}
