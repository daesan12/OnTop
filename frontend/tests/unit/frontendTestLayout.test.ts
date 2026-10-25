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
  it('uses the deployed development layout only on the exact development host', () => {
    expect(parkBindingsUrl('production', false, 'dev.on-top.world')).toBe('/park-bindings.dev.json')
    for (const host of ['www.on-top.world', 'on-top.world', 'localhost', 'dev.on-top.world.example.com']) {
      expect(parkBindingsUrl('production', false, host)).toBe('/park-bindings.json')
    }
    expect(parkBindingsUrl('frontend-test', true, 'dev.on-top.world')).toBe('/park-bindings.frontend-test.json')
  })
  it('resolves the reported development server IDs independently of response order', () => {
    const config = JSON.parse(fs.readFileSync('public/park-bindings.dev.json', 'utf8'))
    const bindings = parseBindings(config.bindings)
    // The authenticated development response supplied on 2026-10-23 lists table-2 first.
    const serverIds = [
      'table-69d1811f-c44e-32d4-bf72-1f4ebe5fb0dd',
      'table-6fcc18fe-a301-3142-a69f-f3f67d026d62',
    ]
    expect(bindings).toHaveLength(2)
    expect(bindAnchor(bindings, 'channel-1', 'table-1', serverIds)).toBe(serverIds[1])
    expect(bindAnchor(bindings, 'channel-1', 'table-2', serverIds)).toBe(serverIds[0])
    expect(bindAnchor(bindings, 'channel-1', 'table-3', serverIds)).toBeNull()
    expect(bindAnchor(bindings, 'channel-2', 'table-1', serverIds)).toBeNull()
    expect(bindAnchor(bindings, 'channel-1', 'table-1', [serverIds[0]!])).toBeNull()
  })
})
