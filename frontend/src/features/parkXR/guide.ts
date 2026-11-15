import logo from '../../assets/entry/ontop-logo.webp'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
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
  ctx.fillText(BALLOON_RIDE_ENABLED
    ? '검지 트리거로 채팅 글자·꼬치왕·열기구 탑승을 선택해요. 비행 중 B는 승강장 복귀예요.'
    : 'X 안내 · Y 주변 채팅 · 글자와 꼬치왕 입구 버튼은 검지 트리거로 선택해요.', 64, 202, 1160)
  if (image.complete && image.naturalWidth) {
    const scale = Math.min(215 / image.naturalWidth, 130 / image.naturalHeight)
    ctx.drawImage(image, 1257, 57, image.naturalWidth * scale, image.naturalHeight * scale)
  }
  paintTouchControllerGuide(ctx)
}
