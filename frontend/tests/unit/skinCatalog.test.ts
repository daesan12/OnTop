import { afterEach, describe, expect, it, vi } from 'vitest'
import { replaceSkinCatalog, catalogAsset, catalogSetImage, catalogSource, useSkinCatalog } from '../../src/world/art/skinCatalog'
import { resolveWholeSkin, wholeSkinCompatible } from '../../src/world/art/wholeSkin'
import { wornPiece } from '../../src/world/art/characterLook'
import { outfitUrl } from '../../src/world/art/outfitSources'
import { equipSlots } from '../../src/network/equipment'
import { fileSpec, uploadFile, type SkinAsset } from '../../src/features/skins/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ProductDisplay } from '../../src/features/gacha/GachaBoxes'

const asset: SkinAsset = { imageKey: 'catalog/11111111-1111-4111-8111-111111111111', productCode: 'HANBOK', name: '봄꽃 한복', grade: 2,
  compatibility: 'FEMALE', wearMode: 'WHOLE', slots: [...equipSlots], modelUrl: 'https://cdn.example.test/published/model.glb', imageUrl: 'https://cdn.example.test/published/image.webp' }
afterEach(() => { replaceSkinCatalog([]); vi.unstubAllGlobals() })
describe('registered skin catalog', () => {
  it('one product chooses a distinct model by character and common skins reuse one file', () => {
    const paired = { ...asset, compatibility: 'ANY' as const, femaleModelUrl: 'https://cdn.example.test/published/female.glb' }
    replaceSkinCatalog([paired])
    const equipment = equipSlots.map((equipSlot, i) => ({ itemId: i + 1, itemCode: 'TEST_' + equipSlot, equipSlot, imageKey: asset.imageKey }))
    const male = resolveWholeSkin('man', equipment)!, female = resolveWholeSkin('girl', equipment)!
    expect(male.url).toBe(asset.modelUrl)
    expect(female.url).toBe(paired.femaleModelUrl)
    expect(male.source).not.toBe(female.source)
    expect(outfitUrl(female.source)).toBe(paired.femaleModelUrl)
    expect(female.setCode).toBe(male.setCode)
    expect(wholeSkinCompatible('man', paired.imageKey)).toBe(true)
    expect(wholeSkinCompatible('girl', paired.imageKey)).toBe(true)
    replaceSkinCatalog([{ ...paired, femaleModelUrl: paired.modelUrl }])
    expect(resolveWholeSkin('girl', equipment)?.url).toBe(paired.modelUrl)
    replaceSkinCatalog([{ ...paired, femaleModelUrl: undefined }])
    expect(resolveWholeSkin('girl', equipment)?.url).toBe(paired.modelUrl)
    expect(() => replaceSkinCatalog([{ ...paired, femaleModelUrl: 'javascript:alert(1)' }])).toThrow()
  })
  it('shows the awarded imageKey even when a product code resembles another set code', () => {
    const other = { ...asset, imageKey: 'catalog/22222222-2222-4222-8222-222222222222', productCode: 'SK_HANBOK',
      wearMode: 'PARTS' as const, slots: ['HAIR' as const], imageUrl: 'https://cdn.example.test/actual-award.webp' }
    replaceSkinCatalog([{ ...asset, wearMode: 'PARTS', slots: ['HAIR'] }, other])
    const html = renderToStaticMarkup(createElement(ProductDisplay, { product: { code: other.productCode, name: other.name,
      grade: other.grade, compatibility: other.compatibility, imageKey: other.imageKey, itemIds: [1] } }))
    expect(html).toContain(other.imageUrl)
    expect(html).not.toContain(asset.imageUrl)
  })
  it('uses a complete compatible whole skin and stable immutable source URL', () => {
    replaceSkinCatalog([asset])
    const equipment = equipSlots.map((equipSlot, i) => ({ itemId: i + 1, itemCode: 'TEST_' + equipSlot, equipSlot, imageKey: asset.imageKey }))
    expect(resolveWholeSkin('girl', equipment)?.url).toBe(asset.modelUrl)
    expect(resolveWholeSkin('man', equipment)).toBeUndefined()
    expect(resolveWholeSkin('girl', equipment.slice(1))).toBeUndefined()
    expect(outfitUrl(catalogSource(asset))).toBe(asset.modelUrl)
    expect(catalogSetImage('SK_HANBOK')).toBe(asset.imageUrl)
    expect(wholeSkinCompatible('man', asset.imageKey)).toBe(false)
  })
  it('parts use the existing a-piece contract, reject malformed URLs, and do not churn for the same catalog', () => {
    replaceSkinCatalog([{ ...asset, wearMode: 'PARTS', slots: ['HAIR'], compatibility: 'ANY' }])
    expect(wornPiece(asset.imageKey)).toEqual({ source: catalogSource(asset), id: 'a' })
    const before = useSkinCatalog.getState()
    replaceSkinCatalog(before.assets)
    expect(useSkinCatalog.getState().revision).toBe(before.revision)
    expect(() => replaceSkinCatalog([{ ...asset, modelUrl: 'javascript:alert(1)' }])).toThrow()
    expect(catalogAsset(asset.imageKey)).toBeDefined()
  })
  it('hashes selected bytes and refuses oversized or mislabeled uploads', async () => {
    const file = new File([new Uint8Array(20)], 'model.glb')
    const spec = await fileSpec(file, '.glb', 20)
    expect(spec.sha256).toHaveLength(64)
    await expect(fileSpec(file, '.glb', 19)).rejects.toThrow()
    await expect(fileSpec(new File([new Uint8Array(20)], 'x.exe'), '.glb', 20)).rejects.toThrow()
  })
  it('sends only the presigned headers and bytes to storage, never the member authorization', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetcher)
    await uploadFile({ url: 'https://upload.example.test/incoming/model.glb', headers: { 'Content-Type': 'model/gltf-binary' } }, new File(['x'], 'a.glb'), new AbortController().signal)
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', method: 'PUT', headers: { 'Content-Type': 'model/gltf-binary' } })
    await expect(uploadFile({ url: 'http://upload.example.test', headers: {} }, new File(['x'], 'a.glb'), new AbortController().signal)).rejects.toThrow()
  })
})
