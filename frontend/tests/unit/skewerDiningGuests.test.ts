import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { Group } from 'three'
import { ParkAssetLoader } from '../../src/world/art/assetLoader'
import { CUSTOMER_ASSETS_V5 } from '../../src/features/bungeoppang/customerAssetsV5'
import { DiningGuest } from '../../src/features/skewer/serviceHall/rendering/DiningGuests'
import { GuestJourney } from '../../src/features/skewer/serviceHall/rendering/GuestJourney'
import { TABLES, walkable } from '../../src/features/skewer/serviceHall/plan'
import type { ToyActor } from '../../src/features/skewer/serviceHall/rendering/ToyPeople'
import { FLOOR_DEPTH_SCALE } from '../../src/features/skewer/serviceHall/rendering/HallFloor'

// Keep real skin weights, geometry, animation and bones. GPU textures are irrelevant to joint tests.
async function rig(id: string) {
  const bytes = await readFile(new URL(`../../public/art/bungeoppang/customers/runtime/${id}.glb`, import.meta.url))
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString())
  delete json.images; delete json.textures; delete json.materials
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded)
  const tail = bytes.subarray(20 + length), result = Buffer.alloc(20 + padded.length + tail.length)
  bytes.copy(result, 0, 0, 12); result.writeUInt32LE(result.length, 8); result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(result, 20); tail.copy(result, 20 + padded.length)
  return new ParkAssetLoader().parseAsync(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength), '')
}

it.each(CUSTOMER_ASSETS_V5.map((asset, index) => [asset.id, index] as const))('%s 실제 리그는 걷기 후에도 의자와 발 접점을 유지한다', async (id, index) => {
  const guest = new DiningGuest(await rig(id), index), parent = new Group(); parent.add(guest.root)
  const hall = new Group(); hall.scale.z = FLOOR_DEPTH_SCALE; hall.add(parent)
  for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) {
    parent.rotation.y = yaw
    guest.update(.04, false, true, false, false, yaw)
    for (let i = 0; i < 3; i++) guest.update(.04, true, false, true, false, yaw)
    expect(Math.abs(guest.root.userData.seatGap)).toBeLessThan(.001)
    for (const gap of guest.root.userData.footGaps) expect(Math.abs(gap)).toBeLessThan(.005)
    expect(guest.labelHeight).toBeGreaterThan(1.4)
  }
  guest.dispose()
}, 15000)

it('모든 좌석의 입장·착석·퇴장이 진행되고 일시정지 중에는 위치가 유지된다', () => {
  for (const seat of TABLES.flatMap(table => table.seats)) {
    const root = new Group(); root.position.set(seat.x, 0, seat.z); root.rotation.y = seat.yaw
    const actor = { root, guestFloorY: 0, greetingVisible: false, pose: () => {}, greet: vi.fn() } as unknown as ToyActor, journey = new GuestJourney(actor)
    journey.update(false, false, 0, false); journey.update(true, false, .05, false)
    expect(root.userData.diningPhase).toBe('arriving')
    const at = root.position.clone(); journey.update(true, false, 0, false); expect(root.position.equals(at)).toBe(true)
    for (let i = 0; i < 300; i++) {
      journey.update(true, false, .05, false)
      if (Math.hypot(root.position.x - seat.x, root.position.z - seat.z) > .95) expect(walkable(root.position)).toBe(true)
    }
    expect(root.userData.diningPhase).toBe('seated')
    expect(root.position.x).toBeCloseTo(seat.x); expect(root.position.z).toBeCloseTo(seat.z)
    journey.update(false, false, .05, false); expect(root.visible).toBe(true)
    for (let i = 0; i < 300; i++) journey.update(false, false, .05, false)
    expect(root.visible).toBe(false)
    journey.update(true, false, .05, true); expect(root.userData.diningPhase).toBe('seated')
  }
})
