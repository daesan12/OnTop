import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { parseBindings, bindAnchor } from '../../src/network/tableBindings'
import { TABLES } from '../../src/config'
import { parkBindingsUrl } from '../../src/park/runtime/deployment'

describe('team frontend-test deployment isolation', () => {
  it('keeps the team local IDs out of default and production mappings', () => {
    const defaults = JSON.parse(
      fs.readFileSync('public/park-bindings.json', 'utf8'),
    )
    expect(defaults.bindings).toEqual([])
    expect(parkBindingsUrl('frontend-test', true)).toBe(
      '/park-bindings.frontend-test.json',
    )
    expect(parkBindingsUrl('development', true)).toBe('/park-bindings.json')
    expect(parkBindingsUrl('frontend-test', false)).toBe('/park-bindings.json')
  })
  it('matches the supplied channel-specific IDs to the existing park coordinates', () => {
    const config = JSON.parse(
      fs.readFileSync('public/park-bindings.frontend-test.json', 'utf8'),
    )
    const bindings = parseBindings(config.bindings)
    expect(bindings).toHaveLength(4)
    expect(new Set(bindings.map((b) => b.tableId)).size).toBe(4)
    for (const channelId of ['channel-1', 'channel-2']) {
      const channel = bindings.filter((b) => b.channelId === channelId)
      expect(channel).toHaveLength(2)
      const serverIds = channel.map((b) => b.tableId)
      for (const anchorId of ['table-1', 'table-2']) {
        const anchor = TABLES.find((t) => t.id === anchorId)!
        expect([...anchor.position]).toEqual([
          anchorId === 'table-1' ? -10 : 10,
          0,
          18,
        ])
        expect(bindAnchor(bindings, channelId, anchorId, serverIds)).toBe(
          channel.find((b) => b.anchorId === anchorId)!.tableId,
        )
        const otherIds = bindings
          .filter((b) => b.channelId !== channelId)
          .map((b) => b.tableId)
        expect(bindAnchor(bindings, channelId, anchorId, otherIds)).toBeNull()
      }
    }
  })
})
