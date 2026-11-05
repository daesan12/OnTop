import type { EquipSlot } from '../../network/equipment'

export interface ShopItem {
  itemId: number; itemCode: string; name: string
  itemType: 'EQUIPMENT' | 'CONSUMABLE'; equipSlot: EquipSlot | null
  price: number; imageKey: string | null
  /** Set outfits (e.g. the general's armour): owned pieces with the same code are worn and taken off together. */
  setCode?: string | null
}
export interface OwnedItem { userItemId: number; item: ShopItem; quantity: number; equipped: boolean }
export interface PurchaseReceipt {
  purchaseId: string; itemId: number; quantity: number; unitPrice: number
  totalPrice: number; balanceAfter: number; userItemId: number
}
export interface WalletBalance { balance: number; reservedBalance: number; availableBalance: number }
export interface PurchaseAttempt { key: string; itemId: number; quantity: number; name: string }
export interface ShopService {
  items(signal?: AbortSignal): Promise<ShopItem[]>
  inventory(signal?: AbortSignal): Promise<OwnedItem[]>
  purchase(attempt: PurchaseAttempt, signal?: AbortSignal): Promise<PurchaseReceipt>
  equip(userItemId: number, signal?: AbortSignal): Promise<OwnedItem[]>
  /** Back to the default outfit in that slot (a set piece takes its whole set off). */
  unequip(userItemId: number, signal?: AbortSignal): Promise<OwnedItem[]>
  wallet(signal?: AbortSignal): Promise<WalletBalance>
}
