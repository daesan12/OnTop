import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'

const entry = vi.hoisted(() => ({ enabled: true, connected: true, phase: 'catalog' as 'catalog' | 'closed' }))
vi.mock('../../src/features/skewer/coop/availability', () => ({ get SKEWER_COOP_ENABLED() { return entry.enabled } }))
vi.mock('../../src/network/worldClient', () => ({ useSession: (selector: (s: object) => unknown) => selector({ status: 'connected', sessionId: 'test', roomId: 'park' }) }))
vi.mock('../../src/world/inputOwnership', () => ({ inputState: {}, clearRoamingInput: vi.fn() }))
vi.mock('../../src/park/runtime/runtime', () => ({ parkRuntime: { get cooperativeGame() { return entry.connected ? {} : undefined }, checkRecovery: vi.fn() } }))
vi.mock('../../src/features/vrZone/parkBridge', () => ({ parkVrZone: { get store() { return createStore(() => ({ phase: entry.phase })) }, close: vi.fn(), endVisit: vi.fn() } }))

import { ParkVrZone } from '../../src/features/vrZone/ParkVrZone'

describe('공원 꼬치왕 협동 진입', () => {
  beforeEach(() => { entry.enabled = true; entry.connected = true; entry.phase = 'catalog' })
  it('점검 중에는 유료 1인 카탈로그 대신 무료 협동 안내를 보여준다', () => {
    entry.enabled = false
    const html = renderToStaticMarkup(React.createElement(ParkVrZone))
    expect(html).toContain('잠시 가게를 정비하고 있어요')
    expect(html).toContain('무료 협동 게임')
    expect(html).not.toContain('10냥')
    expect(html).not.toContain('플레이 방식 선택')
  })
  it('통신 기능이 없을 때도 과거 1인 게임으로 돌아가지 않는다', () => {
    entry.connected = false
    const html = renderToStaticMarkup(React.createElement(ParkVrZone))
    expect(html).toContain('공원 연결을 확인한 뒤 다시 입장해 주세요')
    expect(html).toContain('공원으로 돌아가기')
    expect(html).not.toContain('10냥')
  })
  it('닫힌 입구에는 팝업을 표시하지 않는다', () => {
    entry.phase = 'closed'
    expect(renderToStaticMarkup(React.createElement(ParkVrZone))).toBe('')
  })
})
