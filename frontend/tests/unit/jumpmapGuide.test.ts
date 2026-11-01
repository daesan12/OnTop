import { describe, expect, it } from 'vitest'
import { Box3 } from 'three'
import { canReachJumpmapGuide, JUMPMAP_GUIDE_RADIUS } from '../../src/features/jumpmap/guideState'
import { jumpmapGuideArt } from '../../src/features/jumpmap/guideArt'
import { COURSE, START } from '../../src/features/jumpmap/course'

describe('선택형 돌탑 출발 안내',()=>{
  it('바닥 표식 가까이에서만 읽고 위층이나 첫 발판에서 안내를 끼워 넣지 않는다',()=>{
    expect(canReachJumpmapGuide({x:START.x,y:START.y+.8,z:START.z+2})).toBe(true)
    expect(canReachJumpmapGuide({x:START.x+JUMPMAP_GUIDE_RADIUS+.01,y:START.y+.8,z:START.z})).toBe(false)
    expect(canReachJumpmapGuide({x:START.x,y:START.y+3,z:START.z})).toBe(false)
    expect(canReachJumpmapGuide({x:NaN,y:.8,z:START.z})).toBe(false)
    const first=COURSE[0]!
    expect(canReachJumpmapGuide({x:first.x,y:first.top+.8,z:first.z})).toBe(false)
  })
  it('돌탑 문양이 기존 출발 표식의 바닥 범위와 높이를 벗어나지 않는다',()=>{
    const bounds=new Box3()
    for(const geometry of Object.values(jumpmapGuideArt)) {
      geometry.computeBoundingBox(); bounds.union(geometry.boundingBox!)
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
    }
    expect(bounds.min.x).toBeCloseTo(-1.4); expect(bounds.max.x).toBeCloseTo(1.4)
    expect(bounds.min.z).toBeCloseTo(-1.1); expect(bounds.max.z).toBeCloseTo(1.1)
    expect(bounds.min.y).toBeCloseTo(-.1); expect(bounds.max.y).toBeLessThan(.03)
  })
})
