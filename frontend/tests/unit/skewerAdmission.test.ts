import { createElement } from 'react'
import { prerender } from 'react-dom/static'
import { afterEach, expect, it, vi } from 'vitest'
import { avatars, useSession } from '../../src/network/worldClient'
import { ParkVrZone } from '../../src/features/vrZone/ParkVrZone'
import { openParkVrZone, parkVrEntrance, parkVrZone } from '../../src/features/vrZone/parkBridge'
import { inputState } from '../../src/world/inputOwnership'

const { cooperativeGame, requestJSON, renderLobby } = vi.hoisted(() => ({
  cooperativeGame: {},
  requestJSON: vi.fn(() => { throw new Error('Unexpected wallet or admission request') }),
  renderLobby: vi.fn(),
}))

vi.mock('../../src/park/runtime/runtime', () => ({
  parkRuntime: { cooperativeGame, requestJSON },
}))
vi.mock('../../src/features/skewer/coop/availability', () => ({ SKEWER_COOP_ENABLED: true }))
// Stop at the lobby boundary so this test needs neither WebXR nor a live socket.
vi.mock('../../src/features/skewer/coop/CoopHost', () => ({
  default: (props: { transport: unknown }) => {
    renderLobby(props.transport)
    return createElement('div', null, 'Cooperative lobby')
  },
}))

const userId = 'vr-entry-test'
const previousSession = useSession.getState()

afterEach(() => {
  parkVrZone.close()
  inputState.minigameOpen = false
  avatars.delete(userId)
  useSession.setState(previousSession)
  vi.unstubAllGlobals()
})

it('opens the cooperative lobby from the park entrance without reading the wallet or buying an admission', async () => {
  const fetcher = vi.fn(() => { throw new Error('Unexpected HTTP request') })
  vi.stubGlobal('fetch', fetcher)
  useSession.setState({ status: 'connected', mapCompatible: true, sessionId: userId, roomId: 'channel-1' })
  const pose = parkVrEntrance
  avatars.set(userId, {
    previous: pose, current: pose, at: 0, nickname: '검수', color: 0,
    connected: true, moving: false, running: false, swimming: false,
    emote: '', emoteAt: 0, tableId: '', seatIndex: -1, benchId: '',
    fitnessId: '', fitnessStartedAt: 0, telescopeId: '', telescopeYaw: 0,
    telescopePitch: 0, followTargetId: '',
  })

  expect(openParkVrZone()).toBe(true)
  // Server rendering reads Zustand's initial snapshot. Use the live entrance state.
  vi.spyOn(parkVrZone.store, 'getInitialState').mockImplementation(parkVrZone.store.getState)
  const { prelude } = await prerender(createElement(ParkVrZone))
  expect(await new Response(prelude).text()).toContain('Cooperative lobby')
  expect(renderLobby).toHaveBeenCalledWith(cooperativeGame)
  expect(requestJSON).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
})
