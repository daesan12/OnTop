import { create } from 'zustand'
import type { EquipSlot, PublicEquipment } from '../../network/equipment'
import { avatars, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { viewControls } from '../../world/cameraPerspective'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import type { OwnedItem } from '../shop/contracts'
import { createShopService, ShopError } from '../shop/service'
import { wardrobeView } from './view'
import { gameplayMenusLocked } from '../parkMenus/gameplayLock'
import { WARDROBE_OUTFITS_ENABLED } from './feature'
import { wholeSkinCompatible } from '../../world/art/wholeSkin'

/** Slightly above eye level, so the zoomed figure is seen almost straight on. */
const WARDROBE_PITCH = 0.16
let savedView: { yaw: number; pitch: number } | null = null

export const slotLabels: Record<EquipSlot, string> = { HAIR: '머리', FACE: '얼굴', TOP: '상의', BOTTOM: '하의', SHOES: '신발' }
/** The wardrobe's three places: head and face apart, and the outfit (top, bottom and shoes) worn as one. */
export const OUTFIT_SLOTS: readonly EquipSlot[] = ['TOP', 'BOTTOM', 'SHOES']
export const wardrobeGroups = ['HAIR', 'FACE', 'OUTFIT'] as const
export type WardrobeGroup = typeof wardrobeGroups[number]
export const groupLabels: Record<WardrobeGroup, string> = { HAIR: '머리', FACE: '얼굴', OUTFIT: '옷' }
export const groupOf = (slot: EquipSlot): WardrobeGroup => slot === 'HAIR' || slot === 'FACE' ? slot : 'OUTFIT'
export type WardrobeFilter = 'ALL' | WardrobeGroup

const initial = () => ({
  open: false, owner: '', loading: false, ready: false, error: '', unavailable: false,
  items: [] as OwnedItem[], balance: null as number | null,
  filter: 'ALL' as WardrobeFilter, query: '', previewId: 0, equipping: 0, equipError: '', notice: '',
})
export const useWardrobe = create(initial)
// The wardrobe reuses the shop inventory/equipment contract (docs/shop-inventory.md).
const service = createShopService((path, init) => parkRuntime.requestJSON(path, init))
let epoch = 0, readAbort: AbortController | undefined, writeAbort: AbortController | undefined

const ownerPresent = (owner: string) => {
  const s = useSession.getState()
  return !!owner && s.sessionId === owner && s.status === 'connected' && !!s.roomId
}
const current = (owner: string, generation: number) => epoch === generation && useWardrobe.getState().open
  && useWardrobe.getState().owner === owner && ownerPresent(owner)
const message = (error: unknown) => error instanceof Error ? error.message : '옷장을 불러오지 못했어요.'
/** Only wearable items belong in the wardrobe; consumables stay in the shop. */
export const wearable = (items: OwnedItem[]) => items.filter(owned => owned.item.itemType === 'EQUIPMENT' && !!owned.item.equipSlot)
/** The owned pieces worn together with `owned`: its whole set, or itself. */
export const setPieces = (items: OwnedItem[], owned: OwnedItem) =>
  owned.item.setCode ? items.filter(other => other.item.setCode === owned.item.setCode) : [owned]
/** A set's name from its pieces' shared prefix ("장군 투구", "장군 갑옷" → "장군 세트"); a single item's own name. */
export function itemLabel(items: OwnedItem[], owned: OwnedItem) {
  if (!owned.item.setCode) return owned.item.name
  const names = setPieces(items, owned).map(other => other.item.name)
  let prefix = names[0] ?? ''
  for (const name of names) while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1)
  return prefix.trim() ? `${prefix.trim()} 세트` : owned.item.name
}
/** What is worn after putting `chosen` on, by the server's rule: its set comes with it, the items in those
 * slots come off (all of the outfit's when it touches the outfit: top, bottom and shoes go on as one), and a set
 * that loses a piece comes off whole. */
export function wearing(items: OwnedItem[], chosen: OwnedItem) {
  const on = setPieces(items, chosen), slots = new Set(on.map(owned => owned.item.equipSlot))
  if ([...slots].some(slot => slot && OUTFIT_SLOTS.includes(slot))) OUTFIT_SLOTS.forEach(slot => slots.add(slot))
  const broken = new Set(items.filter(owned => owned.equipped && slots.has(owned.item.equipSlot) && owned.item.setCode).map(owned => owned.item.setCode))
  return [...items.filter(owned => owned.equipped && !slots.has(owned.item.equipSlot) && !broken.has(owned.item.setCode)), ...on]
}
/** The own avatar's public look while trying `previewId` on (null if it is not in the wardrobe). */
export function previewEquipment(items: OwnedItem[], previewId: number): PublicEquipment[] | null {
  const chosen = items.find(owned => owned.userItemId === previewId)
  return chosen ? wearing(items, chosen).map(({ item }) => ({ itemId: item.itemId, itemCode: item.itemCode, equipSlot: item.equipSlot!, imageKey: item.imageKey })) : null
}

export function openWardrobe() {
  const s = useSession.getState()
  if (useWardrobe.getState().open || !ownerPresent(s.sessionId) || panelOwnsKeys() || gameplayMenusLocked()
    || s.tableId || s.benchId || s.fitnessId || s.telescopeId || s.watchedTableId) return
  if (useWardrobe.getState().owner !== s.sessionId) useWardrobe.setState(initial(), true)
  // Other shortcuts stay closed; walking and turning the view keep working (panelOwnsMovement).
  inputState.wardrobeOpen = true
  clearRoamingInput()
  // Turn the park camera round to the front of the own avatar; the camera rig does the zoom.
  savedView = { yaw: viewControls.yaw, pitch: viewControls.pitch }
  const facing = avatars.get(s.sessionId)?.current.yaw
  wardrobeView.active = true
  wardrobeView.aim = { yaw: facing ?? viewControls.yaw, pitch: WARDROBE_PITCH }
  wardrobeView.chooseClearView = true
  useWardrobe.setState({ open: true, owner: s.sessionId, previewId: 0, equipError: '', notice: '' })
  void refreshWardrobe()
}
export function closeWardrobe() {
  ++epoch
  readAbort?.abort(); writeAbort?.abort()
  const wasOpen = useWardrobe.getState().open
  useWardrobe.setState({ open: false, loading: false, equipping: 0, previewId: 0 })
  inputState.wardrobeOpen = false
  wardrobeView.active = false
  wardrobeView.chooseClearView = false
  if (!wasOpen) return
  wardrobeView.aim = savedView
  savedView = null
  clearRoamingInput()
}
/** The ‹ › buttons turn the view round the avatar like a drag does. */
export function turnWardrobeView(by: number) {
  const from = wardrobeView.aim ?? viewControls
  wardrobeView.aim = { yaw: from.yaw + by, pitch: from.pitch }
}
export function resetWardrobe() {
  closeWardrobe()
  useWardrobe.setState(initial(), true)
}
export async function refreshWardrobe() {
  const { owner } = useWardrobe.getState(), generation = epoch
  if (!current(owner, generation)) return
  readAbort?.abort()
  const abort = readAbort = new AbortController()
  useWardrobe.setState({ loading: true, error: '', unavailable: false })
  // Outfits closed (production build): the wardrobe lists none, so the inventory is not read at all.
  const [inventory, wallet] = await Promise.allSettled([WARDROBE_OUTFITS_ENABLED ? service.inventory(abort.signal) : Promise.resolve([]), service.wallet(abort.signal)])
  if (!current(owner, generation) || abort.signal.aborted) return
  if (inventory.status === 'fulfilled') {
    const items = wearable(inventory.value)
    const previewId = items.some(owned => owned.userItemId === useWardrobe.getState().previewId) ? useWardrobe.getState().previewId : 0
    useWardrobe.setState({ loading: false, ready: true, items, previewId })
  } else {
    const reason = inventory.reason
    // Keep the last confirmed list on a failed refresh instead of showing an empty wardrobe.
    useWardrobe.setState({ loading: false, error: message(reason),
      unavailable: reason instanceof ShopError && reason.code === 'SHOP_NOT_CONFIGURED' })
  }
  if (wallet.status === 'fulfilled') {
    useWardrobe.setState({ balance: wallet.value.balance })
    const account = useSession.getState().account
    if (account) useSession.setState({ account: { ...account, balance: wallet.value.balance } })
  }
}
export function setWardrobeFilter(filter: WardrobeFilter) { useWardrobe.setState({ filter }) }
export function setWardrobeQuery(query: string) { useWardrobe.setState({ query }) }
export function previewWardrobeItem(userItemId: number) {
  const s = useWardrobe.getState()
  if (s.equipping || !s.items.some(owned => owned.userItemId === userItemId)) return
  useWardrobe.setState({ previewId: userItemId, equipError: '', notice: '' })
}
export function cancelWardrobePreview() { useWardrobe.setState({ previewId: 0, equipError: '' }) }
/** Back to the default in the previewed item's place (its whole set, for a set piece; the whole outfit, for one of
 * its pieces). */
export async function takeOffPreviewedItem() {
  const s = useWardrobe.getState(), owner = s.owner, generation = epoch
  const target = s.items.find(owned => owned.userItemId === s.previewId)
  if (!current(owner, generation) || !target || !target.equipped || s.equipping || s.loading) return
  const abort = writeAbort = new AbortController()
  useWardrobe.setState({ equipping: target.userItemId, equipError: '', notice: '' })
  try {
    await service.unequip(target.userItemId, abort.signal)
    if (!current(owner, generation)) return
    useWardrobe.setState({ equipping: 0, previewId: 0, notice: `${itemLabel(s.items, target)} 해제를 확인했어요. 기본 옷으로 돌아갔어요.` })
    await refreshWardrobe()
  } catch (error) {
    if (current(owner, generation)) useWardrobe.setState({ equipping: 0, equipError: message(error) })
  }
}
export async function wearPreviewedItem() {
  const s = useWardrobe.getState(), owner = s.owner, generation = epoch
  const target = s.items.find(owned => owned.userItemId === s.previewId)
  if (!current(owner, generation) || !target || target.equipped || s.equipping || s.loading) return
  const variant = useSession.getState().profiles[owner]?.character === 'girl' ? 'girl' : 'man'
  if (!wholeSkinCompatible(variant, target.item.imageKey)) {
    useWardrobe.setState({ equipError: '이 스킨은 남자 캐릭터 전용이에요.' })
    return
  }
  const abort = writeAbort = new AbortController()
  useWardrobe.setState({ equipping: target.userItemId, equipError: '', notice: '' })
  try {
    await service.equip(target.userItemId, abort.signal)
    if (!current(owner, generation)) return
    // The REST answer is the whole equipped list; re-read the inventory so every card is current.
    useWardrobe.setState({ equipping: 0, previewId: 0, notice: `${itemLabel(s.items, target)} 착용을 확인했어요.` })
    await refreshWardrobe()
  } catch (error) {
    if (current(owner, generation)) useWardrobe.setState({ equipping: 0, equipError: message(error) })
  }
}
