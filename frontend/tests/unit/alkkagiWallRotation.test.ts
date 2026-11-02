import {expect,it} from 'vitest'
import {wallRotationStep} from '../../src/game/alkkagi/wallRotation'
it('rotates through all quadrants without a jump at the angle boundary',()=>{
  expect(wallRotationStep(0,0,1).delta).toBeCloseTo(Math.PI/2)
  expect(wallRotationStep(Math.PI-.01,-1,-.01).delta).toBeCloseTo(.02,3)
  expect(wallRotationStep(-Math.PI+.01,-1,.01).delta).toBeCloseTo(-.02,3)
})
it('ignores center crossing and nonfinite pointer coordinates',()=>{
  expect(wallRotationStep(1,0,0)).toEqual({angle:1,delta:0})
  expect(wallRotationStep(1,NaN,2)).toEqual({angle:1,delta:0})
})
