import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recommendedChannel, rememberChannel, rememberedChannel } from '../../src/features/parkMenus/channelEntry'
import type { Channel } from '../../src/network/protocol'

const channels: Channel[] = [
  { channelId: 'busy', name: '운영 공원 1', currentUsers: 28, capacity: 30, joinable: true },
  { channelId: 'quiet', name: '운영 공원 2', currentUsers: 4, capacity: 30, joinable: true },
  { channelId: 'full', name: '운영 공원 3', currentUsers: 30, capacity: 30, joinable: false },
]

const values = new Map<string, string>()
beforeEach(() => {
  values.clear()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('recommendedChannel', () => {
  it('remembers the current tab channel before choosing the least occupied channel', () => {
    expect(recommendedChannel(channels, 'busy')?.channelId).toBe('busy')
    expect(recommendedChannel(channels)?.channelId).toBe('quiet')
  })

  it('does not select a full or excluded channel and preserves server order on a tie', () => {
    expect(recommendedChannel(channels, 'full')?.channelId).toBe('quiet')
    expect(recommendedChannel(channels, '', 'quiet')?.channelId).toBe('busy')
    expect(recommendedChannel([
      { ...channels[0]!, currentUsers: 3 },
      { ...channels[1]!, currentUsers: 3 },
    ])?.channelId).toBe('busy')
  })

  it('stores the last channel per signed-in user for this browser tab', () => {
    rememberChannel('101', 'quiet')
    rememberChannel('202', 'busy')
    expect(rememberedChannel('101')).toBe('quiet')
    expect(rememberedChannel('202')).toBe('busy')
  })
})
