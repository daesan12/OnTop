import type { EquipSlot } from '../../network/equipment'

export interface ShopItem {
  itemId: number; itemCode: string; name: string
  itemType: 'EQUIPMENT' | 'CONSUMABLE'; equipSlot: EquipSlot | null
  price: number; imageKey: string | null
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
  wallet(signal?: AbortSignal): Promise<WalletBalance>
}
