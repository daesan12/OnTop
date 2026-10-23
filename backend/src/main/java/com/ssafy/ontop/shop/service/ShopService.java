package com.ssafy.ontop.shop.service;

import com.ssafy.ontop.inventory.domain.UserItem;
import com.ssafy.ontop.item.domain.ItemType;
import com.ssafy.ontop.shop.ShopException;
import com.ssafy.ontop.shop.domain.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.domain.EquipmentChanged;
import com.ssafy.ontop.shop.domain.ShopPurchase;
import com.ssafy.ontop.shop.dto.EquipmentResponse;
import com.ssafy.ontop.shop.dto.InventoryResponse;
import com.ssafy.ontop.shop.dto.ItemListResponse;
import com.ssafy.ontop.shop.dto.OwnedItemResponse;
import com.ssafy.ontop.shop.dto.PurchaseResponse;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** JPA 지갑 행 잠금 안에서 차감·보유 지급·원장·영수증을 함께 커밋한다. */
public class ShopService {
    private static final Logger log = LoggerFactory.getLogger(ShopService.class);
    private final ShopRepository repository;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;
    private final DuplicateEquipmentPolicy duplicatePolicy;

    public ShopService(ShopRepository repository, PlatformTransactionManager manager,
            ApplicationEventPublisher events, DuplicateEquipmentPolicy duplicatePolicy) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.events = events;
        this.duplicatePolicy = duplicatePolicy;
    }

    public ItemListResponse catalog() {
        return transactions.execute(status -> new ItemListResponse(repository.catalog().stream()
                .map(com.ssafy.ontop.item.domain.Item::toItem).toList()));
    }

    public InventoryResponse inventory(long userId) {
        return transactions.execute(status -> new InventoryResponse(owned(userId, false)));
    }

    public PurchaseResponse purchase(long userId, long itemId, int quantity, String key) {
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
                holding.updateQuantity(nextQuantity);
            }
            repository.persist(new WalletTransaction(wallet.id(), itemId, total, ledgerKey(userId, key)));
            var result = new PurchaseResponse(UUID.randomUUID().toString(), itemId, quantity, item.price(),
                    total, wallet.balance(), holding.id());
            repository.persist(new ShopPurchase(userId, key, result));
            repository.flush();
            return result;
        });
    }

    public EquipmentResponse equip(long userId, long userItemId) {
        if (userId <= 0 || userItemId <= 0) {
            throw error(400, "INVALID_REQUEST", "보유 아이템을 확인하세요.");
        }
        return transactions.execute(status -> {
            lockWallet(userId);
            var holdings = repository.ownedForUpdate(userId);
            var selected = holdings.stream()
                    .filter(value -> value.id() == userItemId && value.quantity() > 0).findFirst()
                    .orElseThrow(() -> error(404, "OWNED_ITEM_NOT_FOUND", "보유한 아이템이 없습니다."));
            var selectedItem = selected.toOwnedItem().item();
            if (selectedItem.itemType() != ItemType.EQUIPMENT || selectedItem.equipSlot() == null) {
                throw error(409, "ITEM_NOT_EQUIPPABLE", "장착 가능한 의상이 아닙니다.");
            }
            for (var holding : holdings) {
                if (holding.toOwnedItem().item().equipSlot() == selectedItem.equipSlot()) {
                    holding.unequip();
                }
            }
            selected.equip();
            repository.flush();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    equipmentCommitted(userId);
                }
            });
            return new EquipmentResponse(holdings.stream().map(UserItem::toOwnedItem)
                    .filter(item -> item.quantity() > 0 && item.equipped()).toList());
        });
    }

    private void equipmentCommitted(long userId) {
        try {
            events.publishEvent(new EquipmentChanged(userId));
        } catch (RuntimeException exception) {
            // 이벤트 예외에는 요청 데이터가 포함될 수 있어 원문 대신 실패 종류만 남긴다.
            log.warn("의상 변경 알림을 전달하지 못했습니다. 보유 목록을 다시 조회하세요. errorType={}",
                    exception.getClass().getSimpleName());
        }
    }

    private Wallet lockWallet(long userId) {
        return repository.lockWallet(userId).orElseThrow(() ->
                error(409, "WALLET_NOT_READY", "지갑 초기화가 필요합니다."));
    }

    private List<OwnedItemResponse> owned(long userId, boolean equippedOnly) {
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
