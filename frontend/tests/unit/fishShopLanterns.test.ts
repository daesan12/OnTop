import {expect,it} from 'vitest'
import {fishBreadShopArt} from '../../src/world/art/luckyFacilityGeometry'
import {FISH_SHOP_LANTERNS} from '../../src/world/art/shopLanternLayout'

it('keeps both lantern bodies and their frames clear of the striped awning',()=>{
 const vertices=fishBreadShopArt.glow!.getAttribute('position')
 expect(vertices.count).toBeGreaterThan(0)
 for(let i=0;i<vertices.count;i++)expect(Math.abs(vertices.getX(i))-4.4).toBeGreaterThan(.2)
 for(const [x] of FISH_SHOP_LANTERNS)expect(Math.abs(x)-.26-4.4).toBeGreaterThan(.15)
 expect(FISH_SHOP_LANTERNS[0]![0]).toBe(-FISH_SHOP_LANTERNS[1]![0])
})
