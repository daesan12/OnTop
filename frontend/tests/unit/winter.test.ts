import { beforeEach, describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { acceptSnowball, acceptWinterState, resetWinter, useWinter, winterFrozen } from '../../src/features/winter/state'
import { snowRoofGeometry } from '../../src/features/winter/roofSnow'
import { winterBoardViewActive } from '../../src/features/winter/boardView'

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
  it('서버 소지량과 동결 상태를 받고 오래된 버전이나 다른 채널 상태를 버린다', () => {
    const player = { userId: 'self', snowballs: 0, hits: 3, freezeId: 'ice', frozenUntil: new Date(now + 5000).toISOString(), escapePresses: 2 }
    expect(acceptWinterState({ channelId: 'park', version: 2, players: [player] }, 'park')).toBe(true)
    expect(winterFrozen('self', now)).toBe(true)
    expect(winterFrozen('self', now + 5000)).toBe(false)
    expect(acceptWinterState({ channelId: 'other', version: 3, players: [] }, 'park')).toBe(false)
    expect(acceptWinterState({ channelId: 'park', version: 1, players: [] }, 'park')).toBe(false)
    expect(useWinter.getState().players.self?.escapePresses).toBe(2)
    expect(acceptWinterState({ channelId: 'park', version: 3, players: [{ ...player, snowballs: 2 }] }, 'park')).toBe(false)
    expect(acceptWinterState({ channelId: 'park', version: 3, players: [{ ...player, hits: 0, freezeId: '', frozenUntil: null, escapePresses: 0 }] }, 'park')).toBe(true)
    expect(winterFrozen('self', now)).toBe(false)
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
  it('이동·회전된 팔각정의 높은 테이블에는 눈을 만들지 않고 지붕 적설은 남긴다', () => {
    const root = new Group(), material = new MeshBasicMaterial()
    root.position.set(12, 8, -9); root.rotation.y = Math.PI / 6
    const table = new Mesh(new BoxGeometry(4, .4, 4), material), roof = new Mesh(new BoxGeometry(6, .4, 6), material)
    table.position.y = 2.8; roof.position.y = 5; root.add(table, roof)
    const snow = snowRoofGeometry(root, [{ x: 12, z: -9, radius: 3, topY: 11.6 }])
    const p = snow.getAttribute('position')
    expect(p.count).toBe(6)
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeCloseTo(5.255)
    expect(table.geometry.getAttribute('position').count).toBe(24)
    snow.dispose(); table.geometry.dispose(); roof.geometry.dispose(); material.dispose()
  })
  it('게임 종류와 무관하게 착석·관전·경기·결과 동안 보호하고 공원 복귀 후 해제한다', () => {
    const session = { tableId: '', focusedAnchorId: '' }, game = { game: null, watchedGameId: '' }
    const lobby = { joiningAnchorId: '', spectatorRequested: false }
    const active = (s = session, g: { game: unknown; watchedGameId: string } = game, l = lobby) => winterBoardViewActive(s, g, l)
    expect(active()).toBe(false)
    expect(active({ ...session, focusedAnchorId: 'table' })).toBe(true)
    expect(active(session, game, { ...lobby, joiningAnchorId: 'table' })).toBe(true)
    expect(active({ ...session, tableId: 'table' })).toBe(true)
    for (const kind of ['omok', 'alkkagi', 'onecard', 'halligalli', 'bridge', 'farkle', 'ledger']) {
      expect(active(session, { ...game, game: { [kind]: { status: 'PLAYING' } } })).toBe(true)
    }
    expect(active(session, { ...game, watchedGameId: 'spectating' })).toBe(true)
    expect(active(session, game, { ...lobby, spectatorRequested: true })).toBe(true)
    expect(active(session, { ...game, game: { status: 'FINISHED' } })).toBe(true)
    expect(active()).toBe(false)
  })
})
