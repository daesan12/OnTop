import { paintGuidePaper, TOUCH_GUIDE_COLORS } from '../../vrGuide/touchControllerGuide'

export type ChefRuntimeNotice = { kind: 'connection' | 'pause' | 'error'; title: string; detail: string; blocking: boolean }

export function chefRuntimeNotice(state: { phase: string; connected: boolean; friendConnected: boolean; paused: boolean; ownPause: boolean; pauseReason?: string; restarting: boolean; error: string }): ChefRuntimeNotice | undefined {
  if (!['PLAYING', 'COUNTDOWN'].includes(state.phase)) return
  if (!state.connected || !state.friendConnected || state.paused && !state.ownPause && state.pauseReason !== 'EXIT_CONFIRM' && !state.restarting) {
    return { kind: 'connection', blocking: true,
      title: !state.connected ? '서버와 다시 연결하고 있어요' : '친구와 다시 연결하고 있어요',
      detail: state.paused ? '영업 시간이 멈췄어요. 연결되면 이어서 진행해요.' : '연결 상태를 확인하고 있어요. 잠시 기다려 주세요.' }
  }
  if (state.paused && !state.ownPause && !state.restarting) return { kind: 'pause', blocking: true, title: '친구가 잠시 쉬고 있어요', detail: '친구가 계속하기를 선택하면 이어서 진행해요.' }
  if (state.error) return { kind: 'error', blocking: false, title: '요리 요청을 확인해 주세요', detail: state.error }
}

export function paintRuntimeNotice(ctx: CanvasRenderingContext2D, notice: ChefRuntimeNotice, paper?: HTMLImageElement) {
  paintGuidePaper(ctx, 300, paper)
  ctx.fillStyle = 'rgba(245,235,211,.94)'; ctx.beginPath(); ctx.roundRect(32, 28, 1472, 244, 16); ctx.fill()
  ctx.textAlign = 'center'; ctx.fillStyle = TOUCH_GUIDE_COLORS.ink; ctx.font = '700 49px "Malgun Gothic",sans-serif'
  ctx.fillText(notice.title, 768, 88, 1410)
  ctx.fillStyle = notice.kind === 'error' ? '#963e2e' : TOUCH_GUIDE_COLORS.ink; ctx.font = '36px "Malgun Gothic",sans-serif'
  const lines = ['']
  for (const word of notice.detail.split(/\s+/u)) {
    const last = lines.length - 1, candidate = lines[last] ? `${lines[last]} ${word}` : word
    if (lines[last] && ctx.measureText(candidate).width > 1400) lines.push(word)
    else lines[last] = candidate
  }
  lines.slice(0, 3).forEach((line, index) => ctx.fillText(line, 768, 146 + index * 49, 1400))
}
