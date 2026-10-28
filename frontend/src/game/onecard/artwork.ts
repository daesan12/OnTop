import { CanvasTexture, SRGBColorSpace, TextureLoader } from 'three'
import type { Card } from './protocol'
import { cardArtwork } from './cardArtwork'

// Code-native artwork stays crisp at every table scale and contains public data only.
function artwork(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath(); ctx.fill()
}
export function createFeltTexture() {
  return artwork(1536, 1024, ctx => {
    const wash = ctx.createRadialGradient(768, 470, 80, 768, 512, 960)
    wash.addColorStop(0, '#245548'); wash.addColorStop(1, '#102f29')
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 1536, 1024)
    // A deterministic woven pattern, without per-frame work or external texture assets.
    for (let y = 0; y < 1024; y += 3) for (let x = 0; x < 1536; x += 4) {
      ctx.fillStyle = (x + y) % 7 < 3 ? '#ffffff08' : '#0000000b'; ctx.fillRect(x, y, 2, 1)
    }
    ctx.strokeStyle = '#c5ad70'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.roundRect(23, 23, 1490, 978, 28); ctx.stroke()
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(35, 35, 1466, 954, 23); ctx.stroke()
    ctx.save(); ctx.strokeStyle = '#cfbd8855'; ctx.lineWidth = 1; ctx.setLineDash([4, 7])
    ctx.beginPath(); ctx.roundRect(47, 47, 1442, 930, 18); ctx.stroke(); ctx.restore()
    ctx.fillStyle = '#c5ad70'
    for (const x of [60, 1476]) for (const y of [60, 964]) {
      diamond(ctx, x, y, 13); ctx.strokeRect(x - 20, y - 20, 40, 40)
      ctx.save(); ctx.translate(x, y); ctx.scale(x < 768 ? 1 : -1, y < 512 ? 1 : -1)
      ctx.beginPath(); ctx.moveTo(27, -8); ctx.bezierCurveTo(65, -8, 40, 18, 68, 18); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-8, 27); ctx.bezierCurveTo(-8, 65, 18, 40, 18, 68); ctx.stroke(); ctx.restore()
    }
    ctx.save(); ctx.globalAlpha = .12; ctx.strokeStyle = '#d6c28a'; ctx.lineWidth = 2
    for (const radius of [176, 186]) { ctx.beginPath(); ctx.arc(768, 512, radius, 0, Math.PI * 2); ctx.stroke() }
    ctx.fillStyle = '#d6c28a'; ctx.font = '100px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const [symbol, x, y] of [['♠', 768, 416], ['♥', 674, 512], ['♣', 862, 512], ['♦', 768, 608]] as const) ctx.fillText(symbol, x, y)
    ctx.restore()
    ctx.save(); ctx.fillStyle = '#cbb98c'; ctx.globalAlpha = .6; ctx.textAlign = 'center'
    ctx.font = '24px Georgia,serif'; ctx.fillText('O N E   C A R D', 768, 850); ctx.restore()
    // The existing deck/discard centers are preserved; outlines simply frame them.
    ctx.strokeStyle = '#c5ad7080'; ctx.lineWidth = 2
    for (const x of [536, 960]) {
      ctx.fillStyle = '#082d271c'; ctx.beginPath(); ctx.roundRect(x - 115, 351, 230, 322, 18); ctx.fill(); ctx.stroke()
      ctx.save(); ctx.strokeStyle = '#c5ad703d'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(x - 123, 343, 246, 338, 24); ctx.stroke(); ctx.restore()
    }
  })
}
function vectorTexture(url: string) {
  const texture = new TextureLoader().load(url)
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}
export function createBackTexture() {
  return vectorTexture('/art/onecard/classic/B-1.svg')
}
export function createFaceTexture(card: Card) {
  return vectorTexture(cardArtwork(card))
}
