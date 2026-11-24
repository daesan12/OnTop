import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { parseBindings, bindAnchor } from '../../src/network/tableBindings'
import { TABLES } from '../../src/config'
import { packagedParkBindings, parkBindingsUrl } from '../../src/park/runtime/deployment'

describe('team frontend-test deployment isolation', () => {
  it('packages the exact deployed layout without requiring a startup HTTP request', () => {
    for (const host of ['dev.on-top.world', 'www.on-top.world', 'localhost', 'dev.on-top.world.example.com']) {
      const file = host === 'dev.on-top.world' ? 'park-bindings.dev.json' : 'park-bindings.json'
      expect(packagedParkBindings(false, host)).toEqual(JSON.parse(fs.readFileSync(`public/${file}`, 'utf8')))
    }
    expect(packagedParkBindings(true, 'dev.on-top.world')).toBeUndefined()
  })
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
    const supplied = JSON.parse(fs.readFileSync('../docs/integration/collision-feedback/park-bindings.frontend-test.json', 'utf8'))
    expect(config.bindings).toEqual(supplied.bindings)
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
    const supplied = JSON.parse(fs.readFileSync('../docs/integration/legacy-tables/bindings.dev.json', 'utf8'))
    expect(config.bindings).toEqual(supplied.bindings)
    expect(bindings).toHaveLength(16)
    expect(new Set(bindings.map((b) => b.tableId)).size).toBe(16)
    expect(new Set(bindings.map((b) => b.anchorId))).toEqual(new Set(TABLES.map((t) => t.id)))
    const serverIds = bindings.map((b) => b.tableId).reverse()
    for (const binding of bindings) {
      expect(bindAnchor(bindings, 'channel-1', binding.anchorId, serverIds)).toBe(binding.tableId)
      expect(bindAnchor(bindings, 'channel-1', binding.anchorId, serverIds.filter((id) => id !== binding.tableId))).toBeNull()
    }
    expect(bindAnchor(bindings, 'channel-2', 'table-1', serverIds)).toBeNull()
  })
})
