import * as THREE from 'three'

/** Serving-hall palette: quiet stone, warm wood, food/state colours as accents. */
export const HALL_STYLE = {
  grout: '#918779',
  floor: ['#c1b6a1', '#bcb19d', '#c4b9a5', '#beb4a0'],
  kitchenFloor: ['#a39886', '#a79c89', '#a19684', '#a99e8d'],
  timber: '#59402f',
  woodEdge: '#654632',
  wood: '#986c48',
  woodLight: '#a47750',
  stone: '#a5a493',
  water: '#355963',
} as const

/** A shared, low-frequency stone wash. No photographic noise or painted grout. */
export function createHallStoneTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#faf9f6'; ctx.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 12; i++) {
    const x = (i * 47 + 13) % 128, y = (i * 31 + 23) % 128, radius = 18 + i % 4 * 6
    const wash = ctx.createRadialGradient(x, y, 0, x, y, radius)
    wash.addColorStop(0, 'rgba(117,109,94,0.045)'); wash.addColorStop(1, 'rgba(117,109,94,0)')
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 128, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4
  return texture
}
