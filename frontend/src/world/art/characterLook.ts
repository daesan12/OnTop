import { BufferAttribute, BufferGeometry, SkinnedMesh } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { equipSlots, type EquipSlot, type PublicEquipment } from '../../network/equipment'
import { catalogAsset, catalogSource } from './skinCatalog'

/**
 * What an avatar wears, slot by slot. Character files hold the shared body, split into pieces by the items
 * that cover them, plus that character's default items; outfit files hold only their items. Every mesh lists
 * its pieces (extras.pieces: [name, first index, index count]) and the game draws only the worn ones:
 * - `body` always, `body__TOPd_BOTTOMg` unless one of those items is worn;
 * - `item__TOP__d` while TOP d from that file is worn, `item__TOP__d__under_TOPb` unless TOP b is worn too;
 * - `item__HAIR__h__for_girl` like `item__HAIR__h`, on the girl only (`__for_man`: the man only).
 * Workshop item files (catalog pieces are always `a`) can list what they cover in mesh extras.covers
 * (`["SHOESg"]`): worn, they hide and cover like that wardrobe item would (see coveredTokens).
 */
export type CharacterVariant = 'man' | 'girl'
export interface Worn { source: string; id: string }
export type Look = Partial<Record<EquipSlot, Worn>>

export const characterSources: readonly CharacterVariant[] = ['man', 'girl']
export const isCharacterSource = (source: string): source is CharacterVariant => characterSources.includes(source as CharacterVariant)

const defaults: Record<CharacterVariant, Look> = {
  man: { HAIR: { source: 'man', id: 'b' }, TOP: { source: 'man', id: 'd' }, BOTTOM: { source: 'man', id: 'd' }, SHOES: { source: 'man', id: 'd' } },
  girl: { HAIR: { source: 'girl', id: 'e' }, TOP: { source: 'girl', id: 'd' }, BOTTOM: { source: 'girl', id: 'd' }, SHOES: { source: 'girl', id: 'd' } },
}
export const defaultLook = (variant: CharacterVariant): Look => ({ ...defaults[variant] })

/** A wearable item's imageKey names its 3D piece: `outfit/<file>/<item>`, the file being a character
 * (man, girl: their default items) or an outfit file under /art/characters/outfits. Anything else stays default. */
const outfitKey = /^outfit\/([a-z0-9-]{1,40})\/([a-z0-9]{1,8})$/
export function wornPiece(imageKey: string | null, variant: CharacterVariant = 'man'): Worn | null {
  const asset = catalogAsset(imageKey)
  if (asset?.wearMode === 'PARTS') return { source: catalogSource(asset) + (asset.compatibility === 'ANY' && variant === 'girl' ? '-girl' : ''), id: 'a' }
  const match = imageKey?.match(outfitKey)
  return match ? { source: match[1]!, id: match[2]! } : null
}

export function resolveLook(variant: CharacterVariant, equipment: readonly PublicEquipment[]): Look {
  const look = defaultLook(variant)
  for (const item of equipment) {
    const worn = wornPiece(item.imageKey, variant)
    if (worn) look[item.equipSlot] = worn
  }
  return look
}

/** Slots whose file has not arrived yet show the default until it has. */
export function availableLook(variant: CharacterVariant, look: Look, available: (source: string) => boolean): Look {
  const shown: Look = {}
  for (const slot of equipSlots) {
    const worn = look[slot] && available(look[slot]!.source) ? look[slot] : defaults[variant][slot]
    if (worn) shown[slot] = worn
  }
  return shown
}

export const lookKey = (look: Look) => equipSlots.map(slot => look[slot] ? `${look[slot]!.source}/${look[slot]!.id}` : '-').join('|')
export const lookSources = (look: Look) => [...new Set(Object.values(look).map(worn => worn.source))]

const tokens = (rule: string | undefined) => rule?.match(/[A-Z]+[a-z0-9]+/g) ?? []
const fileCovers = new WeakMap<GLTF, readonly string[]>()
/** Wardrobe items the worn files say their items cover (mesh extras.covers, e.g. "SHOESg" from a general's
 * boots split into a workshop item). A file only covers slots it is worn in, so a hat file cannot hide a body's feet. */
export function coveredTokens(look: Look, sources: ReadonlyMap<string, GLTF> | undefined): ReadonlySet<string> {
  const covered = new Set<string>()
  if (!sources) return covered
  for (const [slot, piece] of Object.entries(look)) {
    // (a slot left as undefined by a caller is simply not worn)
    const file = piece?.source ? sources.get(piece.source) : undefined
    if (!file) continue
    let listed = fileCovers.get(file)
    if (!listed) {
      const found = new Set<string>()
      file.scene.traverse(object => {
        const covers = (object as SkinnedMesh).isSkinnedMesh ? object.userData.covers : undefined
        if (Array.isArray(covers)) for (const token of covers) if (typeof token === 'string' && /^[A-Z]+[a-z0-9]+$/.test(token)) found.add(token)
      })
      fileCovers.set(file, listed = [...found])
    }
    for (const token of listed) if (token.match(/^[A-Z]+/)![0] === slot) covered.add(token)
  }
  return covered
}

/** Whether a piece of `source` shows on a `variant` avatar wearing `look`. The body comes from the avatar's own file.
 * `covered`: wardrobe items counted as worn for hiding (coveredTokens). */
export function pieceShown(name: string, source: string, variant: CharacterVariant, look: Look, covered: ReadonlySet<string> = new Set()) {
  const worn = new Set([...Object.entries(look).flatMap(([slot, piece]) => piece ? [slot + piece.id] : []), ...covered])
  const body = name.match(/^body(?:__(\w+))?$/)
  if (body) return source === variant && !tokens(body[1]).some(token => worn.has(token))
  // `__for_girl` / `__for_man`: a piece for that character only (a hat's hair: the girl's under it, or the man's)
  const item = name.match(/^item__([A-Z]+)__([a-z0-9]+)(?:__for_(man|girl))?(?:__under_(\w+))?$/)
  if (!item || (item[3] && item[3] !== variant)) return false
  const piece = look[item[1] as EquipSlot]
  return !!piece && piece.source === source && piece.id === item[2] && !tokens(item[4]).some(token => worn.has(token))
}

export type PieceRange = [name: string, start: number, count: number]
const subsets = new WeakMap<BufferGeometry, Map<string, BufferGeometry>>()
/** The shown pieces of a mesh as one geometry: the file's own attributes (shared, uploaded once) and a
 * shorter index. Cached per piece set, so every avatar wearing the same look shares it. */
export function pieceGeometry(geometry: BufferGeometry, pieces: readonly PieceRange[], shown: (name: string) => boolean) {
  const keep = pieces.filter(([name]) => shown(name))
  const key = keep.map(([name]) => name).join(',')
  let cache = subsets.get(geometry)
  if (!cache) subsets.set(geometry, cache = new Map())
  let subset = cache.get(key)
  if (!subset) {
    const source = geometry.index!.array as Uint16Array | Uint32Array
    const index = new (source.constructor as Uint16ArrayConstructor | Uint32ArrayConstructor)(keep.reduce((sum, [, , count]) => sum + count, 0))
    let at = 0
    for (const [, start, count] of keep) {
      index.set(source.subarray(start, start + count), at)
      at += count
    }
    subset = new BufferGeometry()
    for (const [name, attribute] of Object.entries(geometry.attributes)) subset.setAttribute(name, attribute)
    subset.morphAttributes = geometry.morphAttributes
    subset.morphTargetsRelative = geometry.morphTargetsRelative
    subset.setIndex(new BufferAttribute(index, 1))
    cache.set(key, subset)
  }
  return subset
}

const usedVertices = new WeakMap<BufferGeometry, Uint32Array>()
/** Vertices the index draws (hidden pieces' vertices stay in the shared attributes). */
export function drawnVertices(geometry: BufferGeometry) {
  let used = usedVertices.get(geometry)
  if (!used) {
    used = geometry.index ? Uint32Array.from(new Set(geometry.index.array)) : Uint32Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i)
    usedVertices.set(geometry, used)
  }
  return used
}
