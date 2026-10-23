package com.ssafy.ontop.shop;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.inventory.domain.UserItem;
import com.ssafy.ontop.shop.ShopModels.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.ShopModels.Equipment;
import com.ssafy.ontop.shop.ShopModels.EquipmentChanged;
import com.ssafy.ontop.shop.ShopModels.Inventory;
import com.ssafy.ontop.shop.ShopModels.ItemList;
import com.ssafy.ontop.shop.ShopModels.ItemType;
import com.ssafy.ontop.shop.ShopModels.OwnedItem;
import com.ssafy.ontop.shop.ShopModels.Purchase;
import com.ssafy.ontop.shop.persistence.ShopPurchase;
import com.ssafy.ontop.shop.persistence.ShopRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** JPA 지갑 행 잠금 안에서 차감·보유 지급·원장·영수증을 함께 커밋한다. */
public class ShopService {
    private final ShopRepository repository;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;
    private final DuplicateEquipmentPolicy duplicatePolicy;
    private final BehaviorLog behaviorLog;

    public ShopService(ShopRepository repository, PlatformTransactionManager manager,
            ApplicationEventPublisher events, DuplicateEquipmentPolicy duplicatePolicy) {
        this(repository, manager, events, duplicatePolicy, BehaviorLog.disabled());
    }

    public ShopService(ShopRepository repository, PlatformTransactionManager manager,
            ApplicationEventPublisher events, DuplicateEquipmentPolicy duplicatePolicy, BehaviorLog behaviorLog) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.events = events;
        this.duplicatePolicy = duplicatePolicy;
        this.behaviorLog = behaviorLog;
    }

    public ItemList catalog() {
        return transactions.execute(status -> new ItemList(repository.catalog().stream()
                .map(com.ssafy.ontop.item.domain.Item::toItem).toList()));
    }

    public Inventory inventory(long userId) {
        return transactions.execute(status -> new Inventory(owned(userId, false)));
    }

    public Purchase purchase(long userId, long itemId, int quantity, String key) {
        if (userId <= 0 || itemId <= 0 || quantity <= 0 || key == null
                || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "아이템·수량·중복 방지 키를 확인하세요.");
        }
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            var previous = repository.receipt(userId, key);
            if (previous.isPresent()) {
                var saved = previous.get().toPurchase();
                if (saved.itemId() != itemId || saved.quantity() != quantity) {
                    throw error(409, "IDEMPOTENCY_CONFLICT", "같은 키로 다른 구매를 요청할 수 없습니다.");
                }
                return saved;
            }
            var entity = repository.saleItem(itemId).orElseThrow(() ->
                    error(404, "ITEM_NOT_FOUND", "판매 중인 아이템이 없습니다."));
            var item = entity.toItem();
            if (item.itemType() == ItemType.EQUIPMENT && duplicatePolicy == null) {
                throw error(409, "SHOP_POLICY_REQUIRED", "의상 중복 구매 정책 설정이 필요합니다.");
            }
            var existing = repository.holding(userId, itemId);
            if (item.itemType() == ItemType.EQUIPMENT && duplicatePolicy == DuplicateEquipmentPolicy.REJECT
                    && (quantity != 1 || existing.isPresent())) {
                throw error(409, "ITEM_ALREADY_OWNED", "이미 보유했거나 의상 구매 수량이 맞지 않습니다.");
            }
            long total;
            int nextQuantity;
            try {
                total = Math.multiplyExact(item.price(), quantity);
                nextQuantity = Math.addExact(existing.map(UserItem::quantity).orElse(0), quantity);
            } catch (ArithmeticException exception) {
                throw error(400, "QUANTITY_TOO_LARGE", "구매 수량이 너무 큽니다.");
            }
            if (item.price() < 0 || wallet.balance() < wallet.reserved() || wallet.reserved() < 0) {
                throw error(503, "SHOP_UNAVAILABLE", "구매 정보를 확인할 수 없습니다.");
            }
            if (wallet.balance() - wallet.reserved() < total) {
                throw error(409, "INSUFFICIENT_BALANCE", "사용 가능한 엽전이 부족합니다.");
            }
            wallet.debit(total);
            UserItem holding;
            if (existing.isEmpty()) {
                holding = new UserItem(userId, entity, nextQuantity);
                repository.persist(holding);
            } else {
                holding = existing.get();
                holding.quantity(nextQuantity);
            }
            repository.persist(new WalletTransaction(wallet.id(), itemId, total, ledgerKey(userId, key)));
            var result = new Purchase(UUID.randomUUID().toString(), itemId, quantity, item.price(),
                    total, wallet.balance(), holding.id());
            repository.persist(new ShopPurchase(userId, key, result));
            repository.flush();
            // 같은 키 재요청(기존 영수증 반환)은 이 경로에 오지 않으므로 새 구매만 커밋 후 기록한다.
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { purchaseCommitted(userId, result); }
            });
            return result;
        });
    }

    public Equipment equip(long userId, long userItemId) {
        if (userId <= 0 || userItemId <= 0) {
            throw error(400, "INVALID_REQUEST", "보유 아이템을 확인하세요.");
        }
        return transactions.execute(status -> {
            lockWallet(userId);
            var holdings = repository.ownedForUpdate(userId);
            var selected = holdings.stream().filter(value -> value.id() == userItemId && value.quantity() > 0).findFirst()
                    .orElseThrow(() -> error(404, "OWNED_ITEM_NOT_FOUND", "보유한 아이템이 없습니다."));
            var selectedItem = selected.toOwnedItem().item();
            if (selectedItem.itemType() != ItemType.EQUIPMENT || selectedItem.equipSlot() == null) {
                throw error(409, "ITEM_NOT_EQUIPPABLE", "장착 가능한 의상이 아닙니다.");
            }
            for (var holding : holdings) {
                if (holding.toOwnedItem().item().equipSlot() == selectedItem.equipSlot()) {
                    holding.equipped(false);
                }
            }
            selected.equipped(true);
            repository.flush();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { equipmentCommitted(userId, selectedItem.itemId()); }
            });
            return new Equipment(holdings.stream().map(UserItem::toOwnedItem)
                    .filter(item -> item.quantity() > 0 && item.equipped()).toList());
        });
    }

    private void purchaseCommitted(long userId, Purchase purchase) {
        behaviorLog.record(() -> BehaviorEvent.builder(BehaviorEventType.SHOP_PURCHASED, Instant.now())
                .userId(userId)
                .prop("itemId", purchase.itemId())
                .prop("quantity", purchase.quantity())
                .prop("purchaseId", purchase.purchaseId())
                .build());
    }

    private void equipmentCommitted(long userId, long itemId) {
        try { events.publishEvent(new EquipmentChanged(userId, itemId)); }
        catch (RuntimeException exception) {
            System.getLogger(ShopService.class.getName()).log(System.Logger.Level.WARNING,
                    "의상 변경 알림을 전달하지 못했습니다. 보유 목록을 다시 조회할 수 있습니다.");
        }
    }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                error(409, "WALLET_NOT_READY", "지갑 초기화가 필요합니다."));
    }

    private List<OwnedItem> owned(long userId, boolean equippedOnly) {
        return repository.owned(userId).stream().map(UserItem::toOwnedItem)
                .filter(item -> !equippedOnly || item.equipped()).toList();
    }

    private static ShopException error(int status, String code, String message) {
        return new ShopException(status, code, message);
    }

    private static String ledgerKey(long userId, String key) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return "shop:" + userId + ":" + java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 지원이 필요합니다.", exception);
        }
    }
}
