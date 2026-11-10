import { DAILY_CAP, REWARDS } from './course'
import { paintGuidePaper, paintTouchControllerGuide, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'
const { ink, muted } = TOUCH_GUIDE_COLORS
const W = 1536

/** Jumpmap rules and artwork stay local; controller anatomy is shared with park and kitchen help. */
export function paintJumpmapXRGuide(ctx: CanvasRenderingContext2D, illustration: HTMLImageElement, texture: HTMLImageElement) {
  paintGuidePaper(ctx, 1024, texture)
  ctx.fillStyle = ink; ctx.font = '700 58px "BusanDandiMyeongjo", "Malgun Gothic", serif'
  ctx.fillText('돌탑 점프맵 · VR 조작 안내', 64, 100)
  ctx.font = '34px "Malgun Gothic", sans-serif'
  ctx.fillText('첫 돌에서 출발해, 일곱 구간을 지나 마지막 연잎까지!', 64, 157)
  ctx.fillStyle = muted; ctx.font = '29px "Malgun Gothic", sans-serif'
  ctx.fillText(`구간 보상 합계 ${REWARDS.reduce((sum, value) => sum + value, 0)}냥 · 하루 미니게임 합산 ${DAILY_CAP}냥`, 64, 202)
  if (illustration.complete && illustration.naturalWidth) {
    const h = 145, w = h * illustration.naturalWidth / illustration.naturalHeight
    ctx.save(); ctx.beginPath(); ctx.roundRect(W - 64 - w, 57, w, h, 14); ctx.clip()
    ctx.drawImage(illustration, W - 64 - w, 57, w, h); ctx.restore()
  }

  paintTouchControllerGuide(ctx)
}
