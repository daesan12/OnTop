// Canvas-drawn textures for the encounters: bloodshot eyeballs, irises, wet bare footprints and the long-armed
// shadow. Created on first use in the browser (never at import, so node tests can load the models module).
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

const cache = new Map<string, Texture>()
function canvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = cache.get(key)
  if (!t) {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    draw(c.getContext('2d')!)
    t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4
    cache.set(key, t)
  }
  return t
}
const rnd = (n: number) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s) }

/** Yellowed sclera with red veins creeping in from the edges (sphere UVs: u around, v pole to pole). */
export const scleraTexture = () => canvas('sclera', 512, 256, g => {
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 260)
  grad.addColorStop(0, '#f1ece0'); grad.addColorStop(.55, '#e4d9c0'); grad.addColorStop(1, '#b98d78')
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 46; i++) {
    let x = rnd(i) * 512, y = rnd(i + 1) < .5 ? 4 + rnd(i + 2) * 40 : 252 - rnd(i + 2) * 40
    const toward = y < 128 ? 1 : -1
    g.strokeStyle = `rgba(${150 + rnd(i + 3) * 60},${20 + rnd(i + 4) * 30},30,${.45 + rnd(i + 5) * .4})`
    g.lineWidth = 1.2 + rnd(i + 6) * 1.8; g.beginPath(); g.moveTo(x, y)
    for (let s = 0; s < 7; s++) { x += (rnd(i * 9 + s) - .5) * 28; y += toward * (8 + rnd(i * 7 + s) * 12); g.lineTo(x, y); g.lineWidth *= .82 }
    g.stroke()
  }
})

/** Iris disc (planar UVs): fibres around a black pupil, dark limbal ring. */
export const irisTexture = (hue: string) => canvas('iris-' + hue, 256, 256, g => {
  g.fillStyle = '#0a0705'; g.fillRect(0, 0, 256, 256)
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 126)
  grad.addColorStop(0, '#2b170c'); grad.addColorStop(.28, hue); grad.addColorStop(.8, hue); grad.addColorStop(1, '#120a06')
  g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill()
  for (let i = 0; i < 180; i++) {
    const a = i / 180 * Math.PI * 2, r0 = 34 + rnd(i) * 10, r1 = 92 + rnd(i + 1) * 30
    g.strokeStyle = `rgba(${rnd(i + 2) > .5 ? '255,220,150' : '20,10,5'},${.12 + rnd(i + 3) * .25})`; g.lineWidth = 1 + rnd(i + 4) * 1.5
    g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a + .05) * r1, 128 + Math.sin(a + .05) * r1); g.stroke()
  }
  g.fillStyle = '#030202'; g.beginPath(); g.arc(128, 128, 34, 0, Math.PI * 2); g.fill()
})

/** A wet bare left footprint (mirror the mesh for the right foot); dark and glossy, toes splayed. */
export const footprintTexture = () => canvas('footprint', 128, 256, g => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 256)
  g.fillStyle = 'rgba(16,12,10,.92)'; g.shadowColor = 'rgba(16,12,10,.8)'; g.shadowBlur = 8
  g.beginPath(); g.ellipse(66, 196, 30, 44, -.08, 0, Math.PI * 2); g.fill() // heel
  g.beginPath(); g.ellipse(72, 128, 22, 36, -.18, 0, Math.PI * 2); g.fill() // arch (outer edge)
  g.beginPath(); g.ellipse(62, 78, 40, 30, -.12, 0, Math.PI * 2); g.fill() // ball
  for (const [x, y, r] of [[34, 38, 13], [55, 28, 10], [72, 26, 9], [87, 31, 8], [100, 40, 7]] as const) { g.beginPath(); g.ellipse(x, y, r, r * 1.3, 0, 0, Math.PI * 2); g.fill() }
  // Long toe-claws dragged forward.
  g.strokeStyle = 'rgba(16,12,10,.7)'; g.lineWidth = 3; g.shadowBlur = 0
  for (const [x, y] of [[34, 38], [55, 28], [72, 26], [87, 31]] as const) { g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x - 2, y - 26); g.stroke() }
})

/** The growing wall shadow: a tall thin figure, head cocked, arms raised with too-long fingers; soft edges. */
export const shadowTexture = () => canvas('shadow', 256, 512, g => {
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 512)
  g.filter = 'blur(3px)'; g.fillStyle = 'rgba(4,3,6,.92)'; g.strokeStyle = 'rgba(4,3,6,.92)'; g.lineCap = 'round'
  g.beginPath(); g.ellipse(142, 92, 24, 31, .45, 0, Math.PI * 2); g.fill() // head, cocked
  g.beginPath(); g.moveTo(104, 128); g.quadraticCurveTo(128, 112, 156, 126); g.lineTo(150, 300); g.quadraticCurveTo(128, 318, 108, 300); g.closePath(); g.fill() // torso
  g.lineWidth = 14; g.beginPath(); g.moveTo(120, 300); g.lineTo(108, 412); g.lineTo(100, 500); g.stroke(); g.beginPath(); g.moveTo(140, 300); g.lineTo(152, 410); g.lineTo(160, 500); g.stroke()
  g.lineWidth = 11; g.beginPath(); g.moveTo(110, 140); g.lineTo(58, 210); g.lineTo(30, 116); g.stroke() // left arm raised
  g.beginPath(); g.moveTo(152, 142); g.lineTo(206, 186); g.lineTo(232, 98); g.stroke()
  g.lineWidth = 4
  for (let f = 0; f < 4; f++) {
    g.beginPath(); g.moveTo(30, 116); g.quadraticCurveTo(14 + f * 6, 70 - f * 2, 6 + f * 12, 28 + f * 3); g.stroke()
    g.beginPath(); g.moveTo(232, 98); g.quadraticCurveTo(240 - f * 4, 56, 222 + f * 9, 18 + f * 4); g.stroke()
  }
})

/** A pool of warm lamplight on the wall, for the shadow to stand in (a shadow on an unlit wall is invisible). */
export const wallLightTexture = () => canvas('wall-light', 256, 256, g => {
  const grad = g.createRadialGradient(128, 118, 8, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,214,160,.9)'); grad.addColorStop(.45, 'rgba(230,170,110,.55)'); grad.addColorStop(1, 'rgba(120,80,40,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256)
})

/** Coarse sackcloth with a stitched seam (for the lift passenger's hood). */
export const sackTexture = () => canvas('sack', 256, 256, g => {
  g.fillStyle = '#6b5d45'; g.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 3) { g.fillStyle = `rgba(40,30,20,${.12 + rnd(y) * .15})`; g.fillRect(0, y, 256, 1) }
  for (let x = 0; x < 256; x += 3) { g.fillStyle = `rgba(255,240,210,${.04 + rnd(x + 300) * .08})`; g.fillRect(x, 0, 1, 256) }
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(${i % 3 ? '40,28,18' : '70,20,14'},${.2 + rnd(i) * .3})`; g.beginPath(); g.ellipse(rnd(i + 1) * 256, rnd(i + 2) * 256, 10 + rnd(i + 3) * 30, 8 + rnd(i + 4) * 22, 0, 0, Math.PI * 2); g.fill() }
  g.strokeStyle = '#2b2118'; g.lineWidth = 3
  for (let y = 10; y < 256; y += 18) { g.beginPath(); g.moveTo(122, y); g.lineTo(134, y + 9); g.stroke() }
})
