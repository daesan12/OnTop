import { Color } from 'three'
import { expect, it } from 'vitest'
import { buildMoleDemoHammer } from '../../park-renewal-preview/approved/mole-shop-20261107-v1/core/frontend/src/world/art/moleShopGeometry'

it('망치 금색 띠의 옆면과 붉은 머리는 같은 원통 표면을 공유하지 않는다', () => {
  const art = buildMoleDemoHammer(), geometry = art.paint!
  const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color')
  const red = new Color('#bd6342'), gold = new Color('#dca64d'), redX: number[] = [], bandX: number[] = []
  for (let i = 0; i < positions.count; i++) {
    const matches = (color: Color) => Math.hypot(colors.getX(i) - color.r, colors.getY(i) - color.g, colors.getZ(i) - color.b) < .001
    if (matches(red)) redX.push(positions.getX(i))
    if (matches(gold) && positions.getX(i) > 0) bandX.push(positions.getX(i))
  }
  expect(redX.length).toBeGreaterThan(0)
  expect(bandX.length).toBeGreaterThan(0)
  expect(Math.max(...redX)).toBeLessThanOrEqual(Math.min(...bandX) + 1e-6)
  Object.values(art).forEach(part => part.dispose())
})
