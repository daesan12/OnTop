import { describe, expect, it } from 'vitest'
import { LocalVrAdmission, UnavailableVrAdmission } from '../../src/features/vrZone/admission'
import { VrZoneController } from '../../src/features/vrZone/controller'
import { canReachVrEntrance, vrEntrance } from '../../src/features/vrZone/anchors'
import { VR_CATALOG_SLOTS, VR_GAMES } from '../../src/features/vrZone/catalog'

describe('VR zone entry fees', () => {
  it('selects either play mode and allows changing it before payment without charging', async () => {
    const money = new LocalVrAdmission(), zone = new VrZoneController(money)
    await zone.open()
    zone.prepare('pc')
    expect(zone.store.getState().phase).toBe('catalog')
    zone.select('skewer')
    expect(zone.store.getState().phase).toBe('mode')
    expect(await zone.authorize()).toBe(false)
    zone.prepare('vr')
    expect(zone.store.getState()).toMatchObject({ phase: 'game', playMode: 'vr', receipt: null })
    expect(zone.changeMode()).toBe(true)
    zone.prepare('pc')
    expect(zone.store.getState()).toMatchObject({ phase: 'game', playMode: 'pc', receipt: null })
    expect(await money.balance()).toBe(100)
    expect(await zone.authorize()).toBe(true)
    expect(zone.changeMode()).toBe(false)
    expect(await money.balance()).toBe(90)
  })
  it('charges ten once per key and never spends reserved/real account money', async () => {
    const admission = new LocalVrAdmission(20)
    const first = await admission.start('skewer', 'first')
    expect(first).toMatchObject({ fee: 10, availableBalance: 10 })
    expect(await admission.start('skewer', 'first')).toEqual(first)
    expect(await admission.balance()).toBe(10)
    await admission.start('skewer', 'second')
    await expect(admission.start('skewer', 'third')).rejects.toThrow('부족')
    expect(await admission.balance()).toBe(0)
  })
  it('opens, selects and prepares without charging, and blocks insufficient funds', async () => {
    const admission = new LocalVrAdmission(10), zone = new VrZoneController(admission)
    await zone.open(); zone.select('skewer'); zone.prepare('pc')
    expect(await admission.balance()).toBe(10)
    expect(await zone.authorize()).toBe(true)
    expect(await admission.balance()).toBe(0)
    expect(await zone.authorize()).toBe(false)
    expect(zone.back()).toBe(true)
    zone.select('skewer'); zone.prepare('pc')
    expect(zone.store.getState().phase).toBe('mode')
  })
  it('coalesces double starts and blocks leaving while payment is pending', async () => {
    const money = new LocalVrAdmission()
    let release!: () => void
    const pause = new Promise<void>(resolve => { release = resolve })
    const zone = new VrZoneController({ mode: 'local-preview', balance: () => money.balance(), start: async (game, key) => { await pause; return money.start(game, key) } })
    await zone.open(); zone.select('skewer'); zone.prepare('pc')
    const first = zone.authorize(), duplicate = zone.authorize()
    expect(first).toBe(duplicate)
    expect(zone.close()).toBe(false)
    expect(zone.back()).toBe(false)
    release()
    expect(await first).toBe(true)
    expect(await money.balance()).toBe(90)
  })
  it('retries an uncertain response with the original key instead of charging twice', async () => {
    const money = new LocalVrAdmission(), keys: string[] = []
    const zone = new VrZoneController({ mode: 'local-preview', balance: () => money.balance(), start: async (game, key) => {
      keys.push(key)
      const receipt = await money.start(game, key)
      if (keys.length === 1) throw new Error('응답 유실')
      return receipt
    } })
    await zone.open(); zone.select('skewer'); zone.prepare('pc')
    expect(await zone.authorize()).toBe(false)
    expect(zone.back()).toBe(false)
    expect(await zone.authorize()).toBe(true)
    expect(keys[0]).toBe(keys[1])
    expect(await money.balance()).toBe(90)
    expect(await zone.authorize()).toBe(true)
    expect(keys[2]).not.toBe(keys[1])
    expect(await money.balance()).toBe(80)
  })
  it('never falls back to local money when the server admission is unavailable', async () => {
    const unavailable = new UnavailableVrAdmission(async () => 100)
    const zone = new VrZoneController(unavailable)
    await zone.open(); zone.select('skewer'); zone.prepare('pc')
    expect(zone.store.getState().phase).toBe('mode')
    await expect(unavailable.start()).rejects.toThrow('차감되지 않았습니다')
  })
  it('ignores balance responses arriving after the menu closes', async () => {
    let release!: (balance: number) => void
    const zone = new VrZoneController({ mode: 'local-preview', balance: () => new Promise(resolve => { release = resolve }), start: async () => { throw new Error('unused') } })
    const opening = zone.open()
    expect(zone.close()).toBe(true)
    release(100); await opening
    expect(zone.store.getState()).toMatchObject({ phase: 'closed', balance: null, loading: false })
  })
  it('keeps one playable game and leaves two expansion slots', () => {
    expect(VR_GAMES.map(game => game.id)).toEqual(['skewer'])
    expect(VR_CATALOG_SLOTS - VR_GAMES.length).toBe(2)
  })
  it('uses the rotated hall entrance and rejects distant, high or invalid positions', () => {
    const entrance = vrEntrance({ x: -74, z: -23 }, Math.PI / 2)
    expect(entrance.x).toBeCloseTo(-66.3)
    expect(entrance.z).toBeCloseTo(-23)
    expect(canReachVrEntrance(entrance, entrance)).toBe(true)
    expect(canReachVrEntrance({ ...entrance, x: -74 }, entrance)).toBe(false)
    expect(canReachVrEntrance({ ...entrance, y: 4 }, entrance)).toBe(false)
    expect(canReachVrEntrance({ ...entrance, x: NaN }, entrance)).toBe(false)
  })
})
