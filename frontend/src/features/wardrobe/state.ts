import { create } from 'zustand'
import type { EquipSlot } from '../../network/equipment'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import type { OwnedItem } from '../shop/contracts'
import { createShopService, ShopError } from '../shop/service'

export type WardrobeFilter = 'ALL' | EquipSlot
export const slotLabels: Record<EquipSlot, string> = { HAIR: '머리', FACE: '얼굴', TOP: '상의', BOTTOM: '하의', SHOES: '신발' }

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

export function openWardrobe() {
  const s = useSession.getState()
  if (useWardrobe.getState().open || !ownerPresent(s.sessionId) || panelOwnsKeys()) return
  if (useWardrobe.getState().owner !== s.sessionId) useWardrobe.setState(initial(), true)
  inputState.wardrobeOpen = true
  clearRoamingInput()
  useWardrobe.setState({ open: true, owner: s.sessionId, previewId: 0, equipError: '', notice: '' })
  void refreshWardrobe()
}
export function closeWardrobe() {
  ++epoch
  readAbort?.abort(); writeAbort?.abort()
  const wasOpen = useWardrobe.getState().open
  useWardrobe.setState({ open: false, loading: false, equipping: 0, previewId: 0 })
  inputState.wardrobeOpen = false
  if (wasOpen) clearRoamingInput()
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
  const [inventory, wallet] = await Promise.allSettled([service.inventory(abort.signal), service.wallet(abort.signal)])
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
export async function wearPreviewedItem() {
  const s = useWardrobe.getState(), owner = s.owner, generation = epoch
  const target = s.items.find(owned => owned.userItemId === s.previewId)
  if (!current(owner, generation) || !target || target.equipped || s.equipping || s.loading) return
  const abort = writeAbort = new AbortController()
  useWardrobe.setState({ equipping: target.userItemId, equipError: '', notice: '' })
  try {
    await service.equip(target.userItemId, abort.signal)
    if (!current(owner, generation)) return
    // The REST answer is the whole equipped list; re-read the inventory so every card is current.
    useWardrobe.setState({ equipping: 0, previewId: 0, notice: `${target.item.name} 착용을 확인했어요.` })
    await refreshWardrobe()
  } catch (error) {
    if (current(owner, generation)) useWardrobe.setState({ equipping: 0, equipError: message(error) })
  }
}
