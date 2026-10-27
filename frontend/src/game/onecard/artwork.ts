import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Card } from './protocol'
import { redCard, SUIT_GLYPH } from './presentation'

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
    wash.addColorStop(0, '#28645b'); wash.addColorStop(1, '#123d37')
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 1536, 1024)
    // A deterministic woven pattern, without per-frame work or external texture assets.
    for (let y = 0; y < 1024; y += 3) for (let x = 0; x < 1536; x += 4) {
      ctx.fillStyle = (x + y) % 7 < 3 ? '#ffffff08' : '#0000000b'; ctx.fillRect(x, y, 2, 1)
    }
    ctx.strokeStyle = '#c5ad70'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.roundRect(23, 23, 1490, 978, 28); ctx.stroke()
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(35, 35, 1466, 954, 23); ctx.stroke()
    ctx.fillStyle = '#c5ad70'
    for (const x of [60, 1476]) for (const y of [60, 964]) {
      diamond(ctx, x, y, 13); ctx.strokeRect(x - 20, y - 20, 40, 40)
    }
    ctx.save(); ctx.globalAlpha = .19; ctx.strokeStyle = '#d6c28a'; ctx.lineWidth = 3
    for (const radius of [192, 206]) { ctx.beginPath(); ctx.arc(768, 512, radius, 0, Math.PI * 2); ctx.stroke() }
    ctx.fillStyle = '#d6c28a'; ctx.font = '100px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const [symbol, x, y] of [['♠', 768, 416], ['♥', 674, 512], ['♣', 862, 512], ['♦', 768, 608]] as const) ctx.fillText(symbol, x, y)
    ctx.restore()
    // The existing deck/discard centers are preserved; outlines simply frame them.
    ctx.strokeStyle = '#c5ad7080'; ctx.lineWidth = 2
    for (const x of [536, 960]) { ctx.beginPath(); ctx.roundRect(x - 115, 351, 230, 322, 18); ctx.stroke() }
  })
}
export function createBackTexture() {
  return artwork(256, 384, ctx => {
    ctx.fillStyle = '#f6eedc'; ctx.fillRect(0, 0, 256, 384)
    ctx.fillStyle = '#21534e'; ctx.beginPath(); ctx.roundRect(10, 10, 236, 364, 12); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.rect(18, 18, 220, 348); ctx.clip()
    ctx.strokeStyle = '#b6a57555'; ctx.lineWidth = 1
    for (let n = -384; n < 640; n += 26) {
      ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n + 384, 384); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n - 384, 384); ctx.stroke()
    }
    ctx.restore(); ctx.strokeStyle = '#ccb67d'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(20, 20, 216, 344, 8); ctx.stroke()
    ctx.fillStyle = '#21534e'; ctx.beginPath(); ctx.ellipse(128, 192, 47, 65, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#d3bc7c'; diamond(ctx, 128, 192, 23)
  })
}
export function createFaceTexture(card: Card) {
  return artwork(256, 384, ctx => {
    ctx.fillStyle = '#fbf5e7'; ctx.fillRect(0, 0, 256, 384)
    ctx.strokeStyle = '#d6bd81'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(10, 10, 236, 364, 12); ctx.stroke()
    ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(16, 16, 224, 352, 9); ctx.stroke()
    const symbol = card.suit ? SUIT_GLYPH[card.suit] : '✦', rank = card.suit ? card.rank : 'JOKER'
    ctx.fillStyle = redCard(card) ? '#b23c4c' : '#214a46'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.save(); ctx.globalAlpha = .045; ctx.font = '270px Georgia,serif'; ctx.fillText(symbol, 128, 210); ctx.restore()
    ctx.font = '112px Georgia,serif'; ctx.fillText(symbol, 128, 192)
    for (const rotated of [false, true]) {
      ctx.save(); if (rotated) { ctx.translate(256, 384); ctx.rotate(Math.PI) }
      ctx.font = `bold ${card.suit ? 39 : 18}px Georgia,serif`; ctx.fillText(rank, card.suit ? 38 : 53, 42)
      ctx.font = '30px Georgia,serif'; ctx.fillText(symbol, 38, 78); ctx.restore()
    }
  })
}
