import { useEffect, useState } from 'react'
import type { EquipSlot } from '../../network/equipment'

export type CharacterVariant = 'man' | 'girl'
// Each character's own default outfit, rendered slot by slot from its GLB (man/girl × five slots).
const partImages = import.meta.glob<string>('./parts/*.webp', { eager: true, import: 'default' })
export const partImage = (variant: CharacterVariant, slot: EquipSlot) => partImages[`./parts/${variant}-${slot.toLowerCase()}.webp`]
// A whole set's picture (parts/set-<set code>.webp): the character wearing it, since a set is only worn whole.
const setImages = import.meta.glob<string>('./parts/set-*.webp', { eager: true, import: 'default' })
export const setImage = (setCode?: string | null) => setCode ? setImages[`./parts/set-${setCode.toLowerCase()}.webp`] : undefined
// An outfit item's own picture (parts/outfit-<file>-<item>-<slot>.webp, tools/character/item_art.py), by its 3D piece.
const outfitImages = import.meta.glob<string>('./parts/outfit-*.webp', { eager: true, import: 'default' })
export function outfitImage(imageKey: string | null, slot: EquipSlot) {
  const match = imageKey?.match(/^outfit\/([a-z0-9-]+)\/([a-z0-9]+)$/)
  return match ? outfitImages[`./parts/outfit-${match[1]}-${match[2]}-${slot.toLowerCase()}.webp`] : undefined
}

/** Colour words in item names (shop items ship without artwork yet; imageKey has no files behind it). */
const colours: [RegExp, string][] = [
  [/아이보리/, '#ece3cf'], [/베이지/, '#cdb48c'], [/카키/, '#7d7a4a'], [/민트/, '#7fcfbf'], [/하늘/, '#79b6e6'],
  [/남색|네이비/, '#2c3a66'], [/빨간|빨강|레드/, '#c8423a'], [/주황|오렌지/, '#e2813a'], [/노란|노랑|옐로/, '#e6c23a'],
  [/초록|녹색|그린|연두/, '#4f9a52'], [/파란|파랑|블루/, '#3a6fc4'], [/보라|퍼플/, '#7a52a8'], [/분홍|핑크/, '#e08aa8'],
  [/검정|검은|블랙/, '#2a2a2e'], [/흰|하얀|화이트/, '#f1f0ea'], [/회색|그레이/, '#8a8a8a'], [/갈색|브라운/, '#7a5236'],
]
export const itemColour = (name: string) => colours.find(([word]) => word.test(name))?.[1] ?? null

type Hsl = [number, number, number]
const toHsl = (r: number, g: number, b: number): Hsl => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const toRgb = ([h, s, l]: Hsl) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [r + m, g + m, b + m]
}
const hue = (from: number, to: number, saturation: number) => ([h, s]: Hsl) => s > saturation && (from <= to ? h >= from && h <= to : h >= from || h <= to)
const dark = ([, s, l]: Hsl) => l < 0.36 && s < 0.3
/** Which pixels of each default render are the garment itself (sampled from the renders): skin, socks and laces stay. */
const garments: Partial<Record<`${CharacterVariant}-${EquipSlot}`, (pixel: Hsl) => boolean>> = {
  'man-HAIR': ([h, , l]) => h < 50 && l < 0.55, 'girl-HAIR': ([h, , l]) => h < 50 && l < 0.55,
  'man-TOP': hue(195, 255, 0.12), 'man-BOTTOM': dark, 'man-SHOES': hue(195, 255, 0.12),
  'girl-TOP': hue(285, 8, 0.15), 'girl-BOTTOM': dark, 'girl-SHOES': hue(285, 8, 0.1),
}

const cache = new Map<string, Promise<string>>()
/** The default render with its garment repainted in the item's colour, shading kept. */
function recolour(source: string, garment: (pixel: Hsl) => boolean, colour: string) {
  const key = `${source}|${colour}`
  let art = cache.get(key)
  if (!art) {
    art = (async () => {
      const image = new Image(); image.src = source; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
      const frame = context.getImageData(0, 0, canvas.width, canvas.height), data = frame.data
      const target = toHsl(parseInt(colour.slice(1, 3), 16) / 255, parseInt(colour.slice(3, 5), 16) / 255, parseInt(colour.slice(5, 7), 16) / 255)
      const picked: number[] = []
      let lightness = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 24) continue
        const pixel = toHsl(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255)
        if (!garment(pixel)) continue
        picked.push(i); lightness += pixel[2]
      }
      const mean = picked.length ? lightness / picked.length : 0.5
      for (const i of picked) {
        const l = toHsl(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255)[2]
        const rgb = toRgb([target[0], target[1], Math.min(0.97, Math.max(0.04, target[2] + (l - mean) * 0.9))])
        data[i] = rgb[0]! * 255; data[i + 1] = rgb[1]! * 255; data[i + 2] = rgb[2]! * 255
      }
      context.putImageData(frame, 0, 0)
      return canvas.toDataURL('image/webp', 0.92)
    })()
    cache.set(key, art)
  }
  return art
}

/** Picture of an outfit on the own character: the slot's render, recoloured when the name names a colour. */
export function useItemArt(variant: CharacterVariant, slot: EquipSlot, name?: string) {
  const source = partImage(variant, slot)
  const garment = garments[`${variant}-${slot}`], colour = name ? itemColour(name) : null
  const [art, setArt] = useState<{ key: string; url: string } | null>(null)
  const key = `${source}|${colour}`
  useEffect(() => {
    if (!source || !garment || !colour) return
    let live = true
    recolour(source, garment, colour).then(url => { if (live) setArt({ key, url }) }, () => {})
    return () => { live = false }
  }, [source, garment, colour, key])
  return colour && garment && art?.key === key ? art.url : source
}
