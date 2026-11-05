import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { avatarMenuRaycast } from '../../src/world/avatarMenuPicking'

const ray = () => new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1))
function fixture() {
  let event: { type: string; button?: number; ctrlKey?: boolean; pointerType?: string } | null = null
  const root = new Group(), skin = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  const input = ray()
  root.add(skin)
  root.raycast = avatarMenuRaycast(() => event, input)
  root.updateMatrixWorld(true)
  return { root, skin, input, setEvent: (next: typeof event) => { event = next } }
}

describe('avatar context-menu picking', () => {
  it.each([
    null, { type: 'pointerdown', button: 0 }, { type: 'pointerdown', button: 1 },
    { type: 'pointerup', button: 2 }, { type: 'pointermove', button: 2 },
    { type: 'click', button: 0 }, { type: 'dblclick', button: 0 }, { type: 'wheel' },
  ])('avoids recursive model picking for unrelated input %j', event => {
    const { root, skin, input, setEvent } = fixture()
    const picking = vi.spyOn(skin, 'raycast')
    setEvent(event)
    expect(input.intersectObject(root)).toEqual([])
    expect(picking).not.toHaveBeenCalled()
  })

  it.each([{ type: 'pointerdown', button: 2 }, { type: 'contextmenu', button: 2 },
    { type: 'pointerdown', button: 0, ctrlKey: true },
    { type: 'pointerdown', button: 0, pointerType: 'touch' },
    { type: 'pointerdown', button: 0, pointerType: 'pen' }])(
    'keeps the exact visible mesh and distance for %j, without a second recursive pass', event => {
      const { root, skin, input, setEvent } = fixture()
      const expected = ray().intersectObject(skin)
      const picking = vi.spyOn(skin, 'raycast')
      setEvent(event)
      const hits = input.intersectObject(root)
      expect(hits.map(hit => [hit.object, hit.distance])).toEqual(expected.map(hit => [hit.object, hit.distance]))
      expect(picking).toHaveBeenCalledTimes(1)
    },
  )

  it('ignores hidden LODs and hidden ancestor groups and follows an LOD swap immediately', () => {
    const { root, skin, input, setEvent } = fixture()
    const far = skin.clone(), hidden = new Group(), hiddenSkin = skin.clone()
    far.visible = false
    hidden.visible = false; hidden.add(hiddenSkin)
    root.add(far, hidden); root.updateMatrixWorld(true)
    const nearPick = vi.spyOn(skin, 'raycast'), farPick = vi.spyOn(far, 'raycast'), hiddenPick = vi.spyOn(hiddenSkin, 'raycast')
    setEvent({ type: 'contextmenu' })
    expect(input.intersectObject(root).every(hit => hit.object === skin)).toBe(true)
    expect(nearPick).toHaveBeenCalledTimes(1); expect(farPick).not.toHaveBeenCalled(); expect(hiddenPick).not.toHaveBeenCalled()
    skin.visible = false; far.visible = true
    expect(input.intersectObject(root).every(hit => hit.object === far)).toBe(true)
    expect(nearPick).toHaveBeenCalledTimes(1); expect(farPick).toHaveBeenCalledTimes(1)
    root.visible = false
    expect(input.intersectObject(root)).toEqual([])
  })

  it('keeps closest-hit ordering, triangle misses and per-object layer filtering', () => {
    const { root, skin, input, setEvent } = fixture()
    const closer = skin.clone(); closer.position.z = 2; root.add(closer)
    root.updateMatrixWorld(true); setEvent({ type: 'contextmenu' })
    expect(input.intersectObject(root)[0]?.object).toBe(closer)
    closer.layers.set(1)
    expect(input.intersectObject(root)[0]?.object).toBe(skin)
    skin.position.x = 3; root.updateMatrixWorld(true)
    expect(input.intersectObject(root)).toEqual([])
  })

  it('does not block a child that R3F picks separately for its own game interaction', () => {
    const { root, skin, input, setEvent } = fixture()
    setEvent({ type: 'pointerdown', button: 0 })
    expect(input.intersectObject(root)).toEqual([])
    expect(ray().intersectObject(skin).length).toBeGreaterThan(0)
  })

  it('preserves independent scene and game raycasts regardless of the last pointer event', () => {
    const { root, skin, input, setEvent } = fixture()
    setEvent({ type: 'pointermove' })
    expect(input.intersectObject(root)).toEqual([])
    expect(ray().intersectObject(root)[0]?.object).toBe(skin)
  })
})
