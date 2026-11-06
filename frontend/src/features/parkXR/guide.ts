import logo from '../../assets/entry/ontop-logo.webp'
import { paintGuidePaper, paintTouchControllerGuide, TOUCH_GUIDE_COLORS } from '../vrGuide/touchControllerGuide'

export { logo as parkGuideArt }
export function paintParkXRGuide(ctx: CanvasRenderingContext2D, image: HTMLImageElement, paper: HTMLImageElement) {
  paintGuidePaper(ctx, 1024, paper)
  const { ink, muted } = TOUCH_GUIDE_COLORS
  ctx.fillStyle = ink; ctx.font = '700 58px "BusanDandiMyeongjo", "Malgun Gothic", serif'
  ctx.fillText('공원 · VR 조작 안내', 64, 100)
  ctx.font = '34px "Malgun Gothic", sans-serif'
  ctx.fillText('왼쪽 스틱으로 걷고, 고개를 돌려 공원을 둘러보세요.', 64, 157)
  ctx.fillStyle = muted; ctx.font = '29px "Malgun Gothic", sans-serif'
  ctx.fillText('X로 안내 열기 · 안내판에서 공원 조작과 돌탑 놀이 방법을 바꿔봐요.', 64, 202)
  if (image.complete && image.naturalWidth) {
    const scale = Math.min(215 / image.naturalWidth, 130 / image.naturalHeight)
    ctx.drawImage(image, 1257, 57, image.naturalWidth * scale, image.naturalHeight * scale)
  }
  paintTouchControllerGuide(ctx)
}
