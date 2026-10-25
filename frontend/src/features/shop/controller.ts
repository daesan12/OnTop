import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { createShopService, ShopError } from './service'
import type { OwnedItem, PurchaseAttempt, PurchaseReceipt, ShopItem, WalletBalance } from './contracts'
import { keepPendingPurchase, readPendingPurchase } from './pendingPurchase'

const initial = () => ({
  open: false, owner: '', tab: 'shop' as 'shop' | 'inventory', loading: false,
  items: [] as ShopItem[], inventory: [] as OwnedItem[], productsReady: false, inventoryReady: false,
  productError: '', inventoryError: '', walletError: '', wallet: null as WalletBalance | null,
  selected: null as { item: ShopItem; quantity: number } | null,
  attempt: null as PurchaseAttempt | null, purchasing: false, purchaseError: '',
  receipt: null as PurchaseReceipt | null, equipping: 0, equipError: '', notice: '',
})
export const useShop = create(initial)
const service = createShopService((path, init) => parkRuntime.requestJSON(path, init))
let epoch = 0, readSequence = 0
let readAbort: AbortController | undefined, writeAbort: AbortController | undefined
const ownerPresent = (owner: string) => {
  const s = useSession.getState()
  return s.sessionId === owner && s.status === 'connected' && !!s.roomId
}
const current = (owner: string, generation: number) => epoch === generation && useShop.getState().open
  && useShop.getState().owner === owner && ownerPresent(owner)
const message = (error: unknown) => error instanceof Error ? error.message : '요청 결과를 확인하지 못했어요.'

export function openShop() {
  const s = useSession.getState()
  if (useShop.getState().open || !ownerPresent(s.sessionId) || panelOwnsKeys()) return
  if (useShop.getState().owner !== s.sessionId) resetShop()
  inputState.shopOpen = true
  clearRoamingInput()
  const attempt = useShop.getState().attempt ?? readPendingPurchase(s.sessionId)
  useShop.setState({ open: true, owner: s.sessionId, attempt,
    ...(attempt ? { purchaseError: '확인하지 못한 구매가 있어요. 같은 구매 다시 확인을 눌러 주세요.' } : {}) })
  void refreshShop()
}
export function closeShop() {
  ++epoch; ++readSequence
  readAbort?.abort(); writeAbort?.abort()
  const state = useShop.getState()
  useShop.setState({ open: false, loading: false, purchasing: false, equipping: 0, selected: null,
    ...(state.purchasing ? { purchaseError: '구매 결과를 받지 못했어요. 상점을 다시 열어 같은 구매를 확인해 주세요.' } : {}) })
  inputState.shopOpen = false
  if (state.open) clearRoamingInput()
}
export function resetShop() {
  keepPendingPurchase(useShop.getState().owner, null)
  closeShop()
  useShop.setState(initial(), true)
}
export async function refreshShop() {
  const state = useShop.getState(), owner = state.owner, generation = epoch, sequence = ++readSequence
  if (!current(owner, generation)) return
  readAbort?.abort()
  const abort = readAbort = new AbortController()
  useShop.setState({ loading: true, productsReady: false, inventoryReady: false, productError: '', inventoryError: '', walletError: '' })
  const [products, inventory, wallet] = await Promise.allSettled([
    service.items(abort.signal), service.inventory(abort.signal), service.wallet(abort.signal),
  ])
  if (!current(owner, generation) || sequence !== readSequence) return
  useShop.setState({ loading: false,
    ...(products.status === 'fulfilled' ? { items: products.value, productsReady: true }
      : { productError: message(products.reason) }),
    ...(inventory.status === 'fulfilled' ? { inventory: inventory.value, inventoryReady: true }
      : { inventoryError: message(inventory.reason) }),
    ...(wallet.status === 'fulfilled' ? { wallet: wallet.value } : { wallet: null, walletError: message(wallet.reason) }),
  })
  if (wallet.status === 'fulfilled') {
    const account = useSession.getState().account
    if (account) useSession.setState({ account: { ...account, balance: wallet.value.balance } })
  }
}
export function selectShopItem(item: ShopItem) {
  const s = useShop.getState()
  if (!s.productsReady || s.loading || s.purchasing || s.attempt || s.equipping
    || !s.items.some(p => p.itemId === item.itemId) || !ownerPresent(s.owner)) return
  useShop.setState({ selected: { item, quantity: 1 }, receipt: null, purchaseError: '', notice: '' })
}
export function setShopQuantity(quantity: number) {
  const s = useShop.getState()
  if (!s.selected || s.attempt || s.purchasing || s.selected.item.itemType === 'EQUIPMENT') return
  useShop.setState({ selected: { ...s.selected, quantity } })
}
export async function purchaseShopItem() {
  const s = useShop.getState(), owner = s.owner, generation = epoch
  if (!current(owner, generation) || s.purchasing || s.equipping) return
  let attempt = s.attempt
  if (!attempt) {
    if (!s.selected || !s.productsReady || s.loading) return
    const { item, quantity } = s.selected
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647
      || (item.itemType === 'EQUIPMENT' && quantity !== 1) || !Number.isSafeInteger(item.price * quantity)) return
    attempt = { itemId: item.itemId, quantity, name: item.name, key: crypto.randomUUID() }
  }
  const abort = writeAbort = new AbortController()
  keepPendingPurchase(owner, attempt)
  useShop.setState({ attempt, purchasing: true, purchaseError: '', receipt: null, notice: '' })
  try {
    const receipt = await service.purchase(attempt, abort.signal)
    if (!current(owner, generation)) return
    // A replay receipt's balanceAfter is historical: only a new wallet GET updates the HUD.
    keepPendingPurchase(owner, null)
    useShop.setState({ receipt, attempt: null, selected: null, purchasing: false, notice: `${attempt.name} 구매를 확인했어요.` })
    await refreshShop()
  } catch (error) {
    if (!current(owner, generation)) return
    const uncertain = !(error instanceof ShopError) || error.uncertain
    if (!uncertain) keepPendingPurchase(owner, null)
    useShop.setState({ purchasing: false, purchaseError: message(error), ...(uncertain ? {} : { attempt: null }) })
  }
}
export async function equipShopItem(item: OwnedItem) {
  const s = useShop.getState(), owner = s.owner, generation = epoch
  if (!current(owner, generation) || !s.inventoryReady || s.loading || s.purchasing || s.attempt || s.equipping
    || item.item.itemType !== 'EQUIPMENT' || !item.item.equipSlot || item.equipped
    || !s.inventory.some(owned => owned.userItemId === item.userItemId)) return
  const abort = writeAbort = new AbortController()
  useShop.setState({ equipping: item.userItemId, equipError: '', notice: '' })
  try {
    await service.equip(item.userItemId, abort.signal)
    if (!current(owner, generation)) return
    // REST confirms the inventory; only WORLD_STATE can change avatar equipment.
    useShop.setState({ equipping: 0, notice: `${item.item.name} 장착을 확인했어요.` })
    await refreshShop()
  } catch (error) {
    if (current(owner, generation)) useShop.setState({ equipping: 0, equipError: message(error) })
  }
}
