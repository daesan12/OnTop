/** Canvas equivalents of the shared web tablet and PaperPopup, for immersive WebXR. */
export function panelBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  fill: string | CanvasGradient, stroke: string, radius = 18) {
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); ctx.stroke()
}

export function loadPanelArt(src: string, redraw: () => void) {
  const img = new Image()
  img.onload = redraw
  img.src = src
  return img
}

export function drawWebPanel(ctx: CanvasRenderingContext2D, paper: HTMLImageElement) {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.beginPath(); ctx.roundRect(8, 8, width - 16, height - 16, 22); ctx.clip()
  ctx.fillStyle = '#f5ebd3'; ctx.fillRect(0, 0, width, height)
  if (paper.complete && paper.naturalWidth) ctx.drawImage(paper, 0, 0, width, height)
  ctx.restore()
  for (const [offset, color] of [[9, '#b99c61'], [16, '#fff5de'], [22, '#c9b88b']] as const) {
    ctx.beginPath(); ctx.roundRect(offset, offset, width - 2 * offset, height - 2 * offset, 17)
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
  }
}

export function panelPhoto(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number, centerY = .5, sprite = false) {
  panelBox(ctx, x, y, w, h, '#ead6b7', '#c4af80')
  if (!image.complete || !image.naturalWidth) return
  const sourceW = image.naturalWidth / (sprite ? 2 : 1), sourceH = image.naturalHeight / (sprite ? 2 : 1)
  const scale = Math.max(w / sourceW, h / sourceH)
  const cropW = w / scale, cropH = h / scale
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.clip()
  ctx.drawImage(image, (sourceW - cropW) / 2, (sourceH - cropH) * centerY, cropW, cropH, x, y, w, h)
  ctx.restore()
}

export function panelButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  label: string, hover: boolean, variant: 'primary' | 'secondary' | 'room' = 'primary') {
  const primary = variant === 'primary'
  const fill = ctx.createLinearGradient(0, y, 0, y + h)
  fill.addColorStop(0, primary ? hover ? '#407051' : '#244f33' : variant === 'room' ? hover ? '#a36a3c' : '#85502b' : hover ? '#e3ebd1' : '#fff6dd')
  fill.addColorStop(1, primary ? hover ? '#2e5c3f' : '#0d2c20' : variant === 'room' ? '#744523' : '#f6ead6')
  panelBox(ctx, x, y, w, h, fill, primary ? '#d4ad57' : '#b8a780', 14)
  if (primary) {
    ctx.strokeStyle = '#d4ad57'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(x + 5, y + 5, w - 10, h - 10, 10); ctx.stroke()
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = variant === 'secondary' ? '#173828' : '#fff6df'
  ctx.font = `700 ${Math.min(42, h * .59)}px ${primary ? 'BusanDandiMyeongjo, serif' : '"Malgun Gothic", sans-serif'}`
  ctx.fillText(label, x + w / 2, y + h / 2, w - 20)
  ctx.textBaseline = 'alphabetic'
}

export function loadPanelFont(redraw: () => void) {
  void document.fonts.load('700 52px BusanDandiMyeongjo', '온탑 오목 꼬치왕').then(redraw, () => {})
}
