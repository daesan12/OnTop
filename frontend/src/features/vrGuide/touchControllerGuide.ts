export const TOUCH_GUIDE_COLORS = { ink: '#163d29', gold: '#b99c61', paper: '#f5ebd3', muted: '#6f654e' } as const
const { ink, gold, paper, muted } = TOUCH_GUIDE_COLORS
export type TouchGuideMode = 'park' | 'chef' | 'chef-practice' | 'solo'
type Point = readonly [number, number]
export const PARK_TOUCH_BINDINGS = [
  ['이동', '왼쪽 스틱 기울이기'], ['달리기', '왼손 그립 + 이동'], ['안내 열기·닫기', '왼손 X 버튼'], ['30도 회전', '오른쪽 스틱 좌우'],
  ['점프 / 안내 닫기', '오른손 A 버튼'], ['VR 종료', '오른손 B 버튼'], ['가리킨 버튼 선택', '양손 검지 트리거'],
]
export function touchBindings(mode: TouchGuideMode): string[][] {
  return mode === 'park' ? PARK_TOUCH_BINDINGS : [
    ['선택·집기·놓기', '양손 검지 트리거'],
    [mode === 'solo' ? '꼬치 잡기·서빙' : '꼬치 잡기', '양손 옆면 그립'],
    ...(mode === 'chef' ? [['일시정지·계속하기', '오른손 B 버튼']] : []),
  ]
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string = ink) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.stroke()
}

/** Quest 2 Touch schematic: thumbstick outside, X/A below Y/B, trigger above side grip. */
function controller(ctx: CanvasRenderingContext2D, x: number, right: boolean, mode: TouchGuideMode) {
  const mirror = right ? -1 : 1, scale = .88, y = 390
  const point = (px: number, py: number): Point => [x + px * mirror * scale, y + py * scale]
  ctx.save(); ctx.translate(x, y); ctx.scale(mirror * scale, scale)
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  // Tracking ring and the gently curved handle preserve the reference silhouette.
  ctx.beginPath(); ctx.ellipse(0, -66, 118, 76, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#e7dbc0'; ctx.fill(); ctx.strokeStyle = ink; ctx.stroke()
  ctx.beginPath(); ctx.ellipse(0, -61, 98, 57, 0, 0, Math.PI * 2)
  ctx.fillStyle = paper; ctx.fill(); ctx.strokeStyle = '#a6946e'; ctx.lineWidth = 2.5; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-52, 26); ctx.bezierCurveTo(-55, 92, -30, 198, -12, 222)
  ctx.bezierCurveTo(4, 246, 51, 223, 56, 193); ctx.lineTo(78, 28); ctx.closePath()
  const shell = ctx.createLinearGradient(-50, 0, 80, 180)
  shell.addColorStop(0, '#fffaf0'); shell.addColorStop(1, '#ded1b5')
  ctx.fillStyle = shell; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.stroke()
  // Index trigger on the upper front edge; middle-finger grip on the side of the handle.
  ctx.beginPath(); ctx.roundRect(74, 18, 27, 31, 9)
  ctx.fillStyle = '#e5bf71'; ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.roundRect(43, 82, 19, 57, 8)
  ctx.fillStyle = mode !== 'park' || !right ? '#e5bf71' : '#e5dcc7'; ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(0, 0, 96, 58, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#fff9ed'; ctx.fill(); ctx.stroke()
  circle(ctx, -39, -8, 26, mode === 'park' ? '#e5bf71' : '#e4e2d6')
  circle(ctx, -39, -8, 17, mode === 'park' ? '#45674f' : '#9a9e8e')
  circle(ctx, 27, 18, 18, mode === 'park' ? '#e5bf71' : '#e4e2d6')
  circle(ctx, 44, -18, 18, (mode === 'park' || mode === 'chef') && right ? '#e5bf71' : '#e4e2d6', (mode === 'park' || mode === 'chef') && right ? ink : '#a7aa98')
  circle(ctx, -13, 30, 8, '#e4e2d6', '#a7aa98')
  ctx.beginPath(); ctx.moveTo(-12, 222); ctx.lineTo(-12, 245); ctx.strokeStyle = '#a6946e'; ctx.lineWidth = 3; ctx.stroke()
  ctx.restore()
  // Draw face labels after mirroring so letters remain readable on both hands.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 24px "Malgun Gothic", sans-serif'
  ctx.fillStyle = mode === 'park' ? ink : '#7d8472'; ctx.fillText(right ? 'A' : 'X', ...point(27, 18))
  ctx.fillStyle = (mode === 'park' || mode === 'chef') && right ? ink : '#7d8472'; ctx.fillText(right ? 'B' : 'Y', ...point(44, -18))
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  return { stick: point(-39, -8), primary: point(27, 18), secondary: point(44, -18), grip: point(52, 110), trigger: point(88, 33) }
}

function callout(ctx: CanvasRenderingContext2D, number: number, badge: Point, points: Point[]) {
  ctx.strokeStyle = '#6e795d'; ctx.lineWidth = 3; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(...badge); points.forEach(p => ctx.lineTo(...p)); ctx.stroke()
  const target = points.at(-1)!
  circle(ctx, ...target, 5, gold, ink)
  circle(ctx, ...badge, 25, ink, gold)
  ctx.fillStyle = '#fff4dc'; ctx.font = '700 30px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(String(number), ...badge)
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
}


export function paintTouchControllerGuide(ctx: CanvasRenderingContext2D, mode: TouchGuideMode = 'park') {
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = '700 34px "Malgun Gothic", sans-serif'
  ctx.fillText('왼손 · LEFT', 500, 258); ctx.fillText('오른손 · RIGHT', 1036, 258)
  ctx.textAlign = 'left'
  const left = controller(ctx, 500, false, mode), right = controller(ctx, 1036, true, mode)

  if (mode === 'park') {
    callout(ctx, 1, [256, 314], [[359, 314], left.stick])
    callout(ctx, 2, [256, 560], [[387, 560], left.grip])
    callout(ctx, 3, [256, 426], [[376, 426], [376, 466], [left.primary[0], 466], [left.primary[0], left.primary[1] + 16]])
    callout(ctx, 4, [1280, 314], [[1177, 314], right.stick])
    callout(ctx, 5, [1280, 560], [[1147, 560], [1147, 466], [right.primary[0], 466], [right.primary[0], right.primary[1] + 16]])
    callout(ctx, 6, [768, 314], [[880, 314], [right.secondary[0], right.secondary[1] - 16]])
    callout(ctx, 7, [768, 560], [[650, 560], [650, left.trigger[1]], left.trigger])
    ctx.strokeStyle = '#6e795d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(793, 560)
    ctx.lineTo(886, 560); ctx.lineTo(886, right.trigger[1]); ctx.lineTo(...right.trigger); ctx.stroke()
    circle(ctx, ...right.trigger, 5, gold, ink)
  } else {
    if (mode === 'chef') callout(ctx, 3, [1280, 314], [[1147, 314], [right.secondary[0], 314], [right.secondary[0], right.secondary[1] - 18]])
    callout(ctx, 2, [256, 560], [[387, 560], left.grip])
    callout(ctx, 2, [1280, 560], [[1149, 560], right.grip])
    callout(ctx, 1, [768, 560], [[650, 560], [650, left.trigger[1]], left.trigger])
    ctx.strokeStyle = '#6e795d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(793, 560)
    ctx.lineTo(886, 560); ctx.lineTo(886, right.trigger[1]); ctx.lineTo(...right.trigger); ctx.stroke()
    circle(ctx, ...right.trigger, 5, gold, ink)
  }
  const controls = touchBindings(mode), columns = mode === 'park' ? 4 : mode === 'chef' ? 3 : 2
  ctx.strokeStyle = '#d4c5a5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64, 620); ctx.lineTo(1472, 620); ctx.stroke()
  controls.forEach(([title, detail], i) => {
    const x = 64 + (i % columns) * (1416 / columns), y = i < columns ? 661 : 751
    circle(ctx, x + 18, y - 11, 18, ink, ink)
    ctx.fillStyle = '#fff4dc'; ctx.font = '700 24px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x + 18, y - 2); ctx.textAlign = 'left'
    ctx.fillStyle = ink; ctx.font = '700 32px "Malgun Gothic", sans-serif'; ctx.fillText(title!, x + 48, y)
    ctx.fillStyle = muted; ctx.font = '29px "Malgun Gothic", sans-serif'; ctx.fillText(detail!, x + 48, y + 39)
  })
}

export function paintGuidePaper(ctx: CanvasRenderingContext2D, height: number, texture?: HTMLImageElement) {
  ctx.clearRect(0, 0, 1536, height)
  ctx.save(); ctx.beginPath(); ctx.roundRect(8, 8, 1520, height - 16, 28); ctx.clip()
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 1536, height)
  if (texture?.complete && texture.naturalWidth) {
    // Same hanji artwork as PaperPopup, with a soft wash behind the reading area.
    ctx.drawImage(texture, 0, 0, 1536, height)
    const wash = ctx.createLinearGradient(0, 0, 0, height)
    wash.addColorStop(0, 'rgba(245,235,211,.10)')
    wash.addColorStop(.22, 'rgba(245,235,211,.38)')
    wash.addColorStop(.43, 'rgba(245,235,211,.74)')
    wash.addColorStop(.82, 'rgba(245,235,211,.74)')
    wash.addColorStop(.91, 'rgba(245,235,211,.20)')
    wash.addColorStop(1, 'rgba(245,235,211,.08)')
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 1536, height)
  }
  ctx.restore()
  ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(9, 9, 1518, height - 18, 28); ctx.stroke()
  ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(17, 17, 1502, height - 34, 22); ctx.stroke()
  ctx.strokeStyle = '#fff5de'; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(22, 22, 1492, height - 44, 19); ctx.stroke()
}

export function paintGuideNotePaper(ctx: CanvasRenderingContext2D, y: number) {
  ctx.save(); ctx.fillStyle = 'rgba(245,235,211,.90)'
  ctx.beginPath(); ctx.roundRect(40, y, 1456, 56, 10); ctx.fill(); ctx.restore()
}

/** PaperPopup's green primary button translated to the in-world canvas. Hit bounds stay unchanged. */
export function paintGuideButton(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string, hover: boolean) {
  ctx.save()
  const fill = ctx.createLinearGradient(0, y, 0, y + height)
  fill.addColorStop(0, hover ? '#426b48' : '#2b5035'); fill.addColorStop(1, hover ? '#254d35' : '#123321')
  ctx.shadowColor = '#543d1940'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, width, height, 20); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#c0a05a'; ctx.lineWidth = 3; ctx.stroke()
  ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 6, y + 6, width - 12, height - 12, 15); ctx.stroke()
  ctx.fillStyle = '#fff5df'; ctx.font = '700 43px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'
  ctx.fillText(label, x + width / 2, y + height / 2 + 15, width - 24)
  ctx.restore()
}
