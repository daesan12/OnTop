import { create } from 'zustand'
import type { SkinAsset } from '../../features/skins/api'

export const useSkinCatalog = create<{ assets: readonly SkinAsset[]; revision: number }>(() => ({ assets: [], revision: 0 }))
export const catalogAsset = (imageKey: string | null) => useSkinCatalog.getState().assets.find(a => a.imageKey === imageKey)
export const catalogSource = (asset: SkinAsset) => 'registered-' + asset.imageKey.slice('catalog/'.length)
export const catalogSourceUrl = (source: string) => useSkinCatalog.getState().assets.find(a => catalogSource(a) === source)?.modelUrl
export const catalogSetImage = (code: string | null | undefined) => code?.startsWith('SK_')
  ? useSkinCatalog.getState().assets.find(a => a.productCode === code.slice(3))?.imageUrl : undefined

export function replaceSkinCatalog(value: unknown) {
  if (!Array.isArray(value) || value.length > 2000) throw new Error('의상 파일 목록을 확인하지 못했어요.')
  const validUrl = (value: unknown) => {
    if (typeof value !== 'string') return false
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash } catch { return false }
  }
  const assets = value.filter((a): a is SkinAsset => !!a && typeof a === 'object'
    && /^catalog\/[0-9a-f-]{36}$/.test(a.imageKey) && typeof a.productCode === 'string'
    && typeof a.name === 'string' && [1, 2, 3, 4].includes(a.grade) && ['MALE', 'FEMALE', 'ANY'].includes(a.compatibility)
    && ['WHOLE', 'PARTS'].includes(a.wearMode) && Array.isArray(a.slots) && a.slots.length > 0
    && a.slots.every((s: unknown) => typeof s === 'string' && ['HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'].includes(s))
    && validUrl(a.modelUrl) && validUrl(a.imageUrl))
  if (assets.length !== value.length) throw new Error('의상 파일 목록 형식이 올바르지 않아요.')
  if (JSON.stringify(assets) !== JSON.stringify(useSkinCatalog.getState().assets)) useSkinCatalog.setState(s => ({ assets, revision: s.revision + 1 }))
}
