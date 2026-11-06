import chefVRArt from '../coop/art/chef-vr-preview.png'
import { paintGuidePaper, paintGuideButton, paintGuideNotePaper, paintTouchControllerGuide, TOUCH_GUIDE_COLORS } from '../../vrGuide/touchControllerGuide'

export { chefVRArt }
export const CHEF_VR_STEPS = [
  ['주문표 선택', '앞쪽 주문표를 가리키고 트리거를 눌러요.'],
  ['재료 집고 꽂기', '트리거를 누른 채 옮겨, 꼬치 끝의 고리가 초록색일 때 놓아요.'],
  ['그립으로 꼬치 잡기 · 고치기', '그립을 놓으면 제작대로 돌아와요. 끝 재료는 가리켜 트리거로 빼요.'],
  ['완성 접시 제출', '오른쪽 전달대의 접시를 가리키고 트리거를 눌러요.'],
] as const

/** Existing kitchen artwork and cooking flow, with the same Touch diagram as the park. */
export function paintChefVRGuide(ctx: CanvasRenderingContext2D, image: HTMLImageElement, online: boolean, paper?: HTMLImageElement) {
  const { ink, muted } = TOUCH_GUIDE_COLORS
  paintGuidePaper(ctx, 1152, paper)
  ctx.fillStyle = ink; ctx.font = '700 58px ChefMyeongjo, "Malgun Gothic", serif'
  ctx.fillText('온탑 꼬치왕 · VR 조작 안내', 64, 100)
  ctx.font = '34px "Malgun Gothic", sans-serif'
  ctx.fillText('그림 주문표는 그대로, 양손 컨트롤러로 요리해요.', 64, 157)
  ctx.fillStyle = muted; ctx.font = '29px "Malgun Gothic", sans-serif'
  ctx.fillText('1 검지 트리거 · 2 옆면 그립 · 스틱과 A/B/X/Y는 사용하지 않아요.', 64, 202)
  if (image.complete && image.naturalWidth) {
    const scale = Math.min(260 / image.naturalWidth, 145 / image.naturalHeight)
    ctx.drawImage(image, 1212, 57, image.naturalWidth * scale, image.naturalHeight * scale)
  }
  paintTouchControllerGuide(ctx, 'chef')
  const steps = [
    ['주문표 선택', '1 주문표를 가리켜 트리거로 선택해요.'],
    ['재료 집고 꽂기', '1 누른 채 옮겨, 초록 고리에서 놓아요.'],
    ['꼬치 잡기 · 수정', '2 그립으로 잡아요. 1 끝 재료를 가리켜 빼요.'],
    ['완성 접시 제출', '1 오른쪽 전달대 접시를 가리켜 눌러요.'],
  ]
  steps.forEach(([title, detail], i) => {
    const x = 64 + i % 2 * 708, y = 762 + Math.floor(i / 2) * 97
    ctx.fillStyle = ink; ctx.font = '700 33px "Malgun Gothic", sans-serif'; ctx.fillText(title!, x, y)
    ctx.fillStyle = muted; ctx.font = '29px "Malgun Gothic", sans-serif'; ctx.fillText(detail!, x, y + 40)
  })
  paintGuideNotePaper(ctx, 950)
  ctx.fillStyle = muted; ctx.font = '30px "Malgun Gothic", sans-serif'
  ctx.fillText(online ? '안내를 읽는 동안에도 영업 시간은 흘러요.' : '연습 모드 · 엽전과 랭킹 기록 없음', 64, 990)
  paintGuideButton(ctx, 64, 1020, 1408, 88, '1 트리거로 안내 닫기', false)
}
