import {it,expect} from 'vitest'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {heightAt,site} from '../../src/park-renewal/plan'
it('전망대 첫 경사로와 정상 원판은 실제 목재 높이를 지지함',()=>{const t=site('tower'),base=heightAt(t.x,t.z),toe=base+.12*40/18,top=base+40+.12*40/18;expect(parkWalkSurface(t.x-6.5,t.z-.1,toe)).toBeGreaterThan(toe);expect(parkWalkSurface(t.x,t.z,top)).toBeCloseTo(top);expect(parkWalkSurface(t.x-6.5,t.z-.1,top)).toBeCloseTo(top);expect(parkWalkSurface(t.x-6.5,t.z+.1,base+.085)).toBeLessThan(base+1)},15000)
