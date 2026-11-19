import { beforeEach, describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { acceptSnowball, resetWinter, useWinter } from '../../src/features/winter/state'
import { snowRoofGeometry } from '../../src/features/winter/roofSnow'

const now = Date.parse('2026-11-19T12:00:00Z')
const shot = { shotId: 'one', channelId: 'park', userId: 'friend', hitUserId: 'self',
  x: 0, y: 1, z: 0, endX: 0, endY: 1, endZ: 5, sentAt: new Date(now).toISOString(), durationMs: 300 }

describe('겨울 공원 이벤트와 적설', () => {
  beforeEach(resetWinter)
  it('현재 채널의 승인만 표시하고 중복과 오래된 이벤트를 무시한다', () => {
    acceptSnowball(shot, 'other', 'self', now)
    expect(useWinter.getState().shots).toHaveLength(0)
    acceptSnowball(shot, 'park', 'self', now)
    acceptSnowball(shot, 'park', 'self', now)
    acceptSnowball({ ...shot, shotId: 'old' }, 'park', 'self', now + 3000)
    expect(useWinter.getState().shots).toHaveLength(1)
    expect(useWinter.getState().notice).toContain('맞았어요')
    resetWinter()
    expect(useWinter.getState().shots).toHaveLength(0)
  })
  it('천장 위쪽만 적설하고 원본 건물과 옆면을 보존한다', () => {
    const root = new Group(), original = new BoxGeometry(4, 4, 4), material = new MeshBasicMaterial()
    const building = new Mesh(original, material)
    building.position.y = 2; root.add(building)
    const snow = snowRoofGeometry(root), position = snow.getAttribute('position')
    expect(position.count).toBe(6)
    for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBeCloseTo(4.055)
    expect(building.geometry).toBe(original)
    expect(original.getAttribute('position').count).toBe(24)
    snow.dispose(); original.dispose(); material.dispose()
  })
})
