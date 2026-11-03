/** Local cover artwork: no external images, extra labels or shortcut text. */
export function paintScorebookCover(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  const ground = ctx.createLinearGradient(0, 0, w, h)
  ground.addColorStop(0, '#493326')
  ground.addColorStop(.45, '#30241c')
  ground.addColorStop(1, '#211c17')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, w, h)
  // Quiet, deterministic grain stays readable at the seated camera distance.
  for (let y = 2; y < h; y += 7) {
    ctx.strokeStyle = y % 3 ? '#ebc88b08' : '#08060316'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, y)
    ctx.bezierCurveTo(w * .3, y - 5, w * .7, y + 5, w, y - 1)
    ctx.stroke()
  }
  const gold = ctx.createLinearGradient(0, 0, w, h)
  gold.addColorStop(0, '#edcf8d')
  gold.addColorStop(.5, '#b38545')
  gold.addColorStop(1, '#d6ae68')
  ctx.strokeStyle = gold
  ctx.lineWidth = 4
  ctx.beginPath(); ctx.roundRect(24, 24, w - 48, h - 48, 16); ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(35, 35, w - 70, h - 70, 10); ctx.stroke()
  // Folded geometric corners echo the traditional HUD without crowding the title.
  for (const [x, y, sx, sy] of [[46, 46, 1, 1], [w - 46, 46, -1, 1], [46, h - 46, 1, -1], [w - 46, h - 46, -1, -1]]) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy)
    ctx.strokeStyle = '#c59b59'; ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 62); ctx.lineTo(0, 0); ctx.lineTo(62, 0)
    ctx.moveTo(10, 43); ctx.lineTo(10, 10); ctx.lineTo(43, 10)
    ctx.moveTo(10, 25); ctx.lineTo(25, 25); ctx.lineTo(25, 10)
    ctx.moveTo(32, 39); ctx.lineTo(39, 32); ctx.lineTo(46, 39); ctx.lineTo(39, 46); ctx.closePath()
    ctx.stroke(); ctx.restore()
  }
  for (const y of [h / 2 - 92, h / 2 + 92]) {
    ctx.strokeStyle = '#ad854b'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(112, y); ctx.lineTo(w / 2 - 16, y)
    ctx.moveTo(w / 2 + 16, y); ctx.lineTo(w - 112, y)
    ctx.moveTo(w / 2, y - 6); ctx.lineTo(w / 2 + 6, y)
    ctx.lineTo(w / 2, y + 6); ctx.lineTo(w / 2 - 6, y); ctx.closePath(); ctx.stroke()
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = '700 70px "BusanDandiMyeongjo", "Malgun Gothic", serif'
  ctx.fillStyle = '#100b08'; ctx.fillText('점수표', w / 2 + 2, h / 2 + 3)
  ctx.fillStyle = '#eed49a'; ctx.fillText('점수표', w / 2, h / 2)
}
