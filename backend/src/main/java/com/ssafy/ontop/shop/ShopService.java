package com.ssafy.ontop.shop;

import com.ssafy.ontop.shop.ShopModels.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.ShopModels.Equipment;
import com.ssafy.ontop.shop.ShopModels.EquipmentChanged;
import com.ssafy.ontop.shop.ShopModels.EquipSlot;
import com.ssafy.ontop.shop.ShopModels.Inventory;
import com.ssafy.ontop.shop.ShopModels.Item;
import com.ssafy.ontop.shop.ShopModels.ItemList;
import com.ssafy.ontop.shop.ShopModels.ItemType;
import com.ssafy.ontop.shop.ShopModels.OwnedItem;
import com.ssafy.ontop.shop.ShopModels.Purchase;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 지갑 행 잠금 안에서 차감·보유 지급·원장·재요청 영수증을 함께 커밋한다. */
public class ShopService {
    private static final String ITEM_COLUMNS =
            "i.id, i.item_code, i.name, i.item_type, i.equip_slot, i.price, i.image_key";
    private static final RowMapper<Item> ITEM = (row, number) -> item(row);
    private static final RowMapper<OwnedItem> OWNED = (row, number) ->
            new OwnedItem(row.getLong("user_item_id"), item(row), row.getInt("quantity"),
                    row.getBoolean("is_equipped"));
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;
    private final DuplicateEquipmentPolicy duplicatePolicy;

    public ShopService(JdbcTemplate jdbc, PlatformTransactionManager manager,
            ApplicationEventPublisher events, DuplicateEquipmentPolicy duplicatePolicy) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(manager);
        this.events = events;
        this.duplicatePolicy = duplicatePolicy;
    }

    public ItemList catalog() {
        return new ItemList(jdbc.query("SELECT " + ITEM_COLUMNS
                + " FROM items i WHERE i.is_for_sale = TRUE ORDER BY i.id", ITEM));
    }

    public Inventory inventory(long userId) {
        return new Inventory(owned(userId, false));
    }

    public Purchase purchase(long userId, long itemId, int quantity, String key) {
        if (userId <= 0 || itemId <= 0 || quantity <= 0 || key == null
                || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw error(400, "INVALID_REQUEST", "아이템·수량·중복 방지 키를 확인하세요.");
        }
        return transactions.execute(status -> {
            Wallet wallet = lockWallet(userId);
            var previous = jdbc.query("""
                    SELECT purchase_id, item_id, quantity, unit_price, total_price, balance_after, user_item_id
                    FROM shop_purchases WHERE user_id = ? AND request_key = ?
                    """, (row, number) -> new Purchase(row.getString(1), row.getLong(2), row.getInt(3),
                    row.getLong(4), row.getLong(5), row.getLong(6), row.getLong(7)), userId, key);
            if (!previous.isEmpty()) {
                var saved = previous.getFirst();
                if (saved.itemId() != itemId || saved.quantity() != quantity) {
                    throw error(409, "IDEMPOTENCY_CONFLICT", "같은 키로 다른 구매를 요청할 수 없습니다.");
                }
                return saved;
            }
            List<Item> items = jdbc.query("SELECT " + ITEM_COLUMNS
                    + " FROM items i WHERE i.id = ? AND i.is_for_sale = TRUE FOR SHARE", ITEM, itemId);
            if (items.isEmpty()) { throw error(404, "ITEM_NOT_FOUND", "판매 중인 아이템이 없습니다."); }
            Item item = items.getFirst();
            if (item.itemType() == ItemType.EQUIPMENT && duplicatePolicy == null) {
                throw error(409, "SHOP_POLICY_REQUIRED", "의상 중복 구매 정책 설정이 필요합니다.");
            }
            var existing = jdbc.query("""
                    SELECT id, quantity FROM user_items WHERE user_id = ? AND item_id = ?
                    """, (row, number) -> new Holding(row.getLong(1), row.getInt(2)), userId, itemId);
            if (item.itemType() == ItemType.EQUIPMENT && duplicatePolicy == DuplicateEquipmentPolicy.REJECT
                    && (quantity != 1 || !existing.isEmpty())) {
                throw error(409, "ITEM_ALREADY_OWNED", "이미 보유했거나 의상 구매 수량이 맞지 않습니다.");
            }
            long total;
            int nextQuantity;
            try {
                total = Math.multiplyExact(item.price(), quantity);
                nextQuantity = Math.addExact(existing.isEmpty() ? 0 : existing.getFirst().quantity(), quantity);
            } catch (ArithmeticException exception) {
                throw error(400, "QUANTITY_TOO_LARGE", "구매 수량이 너무 큽니다.");
            }
            if (item.price() < 0 || wallet.balance() < wallet.reserved() || wallet.reserved() < 0) {
                throw error(503, "SHOP_UNAVAILABLE", "구매 정보를 확인할 수 없습니다.");
            }
            if (wallet.balance() - wallet.reserved() < total) {
                throw error(409, "INSUFFICIENT_BALANCE", "사용 가능한 엽전이 부족합니다.");
            }
            jdbc.update("UPDATE wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
                    total, wallet.id());
            if (existing.isEmpty()) {
                jdbc.update("""
                        INSERT INTO user_items(user_id, item_id, quantity, is_equipped) VALUES (?, ?, ?, FALSE)
                        """, userId, itemId, nextQuantity);
            } else {
                jdbc.update("UPDATE user_items SET quantity = ? WHERE id = ?",
                        nextQuantity, existing.getFirst().id());
            }
            long ownedId = jdbc.queryForObject("SELECT id FROM user_items WHERE user_id = ? AND item_id = ?",
                    Long.class, userId, itemId);
            jdbc.update("""
                    INSERT INTO wallet_transactions(wallet_id, item_id, transaction_type,
                        balance_delta, reserved_delta, idempotency_key, created_at)
                    VALUES (?, ?, 'SHOP_PURCHASE', ?, 0, ?, CURRENT_TIMESTAMP(3))
                    """, wallet.id(), itemId, -total, ledgerKey(userId, key));
            var result = new Purchase(UUID.randomUUID().toString(), itemId, quantity, item.price(),
                    total, wallet.balance() - total, ownedId);
            jdbc.update("""
                    INSERT INTO shop_purchases(purchase_id, user_id, request_key, item_id, quantity,
                        unit_price, total_price, balance_after, user_item_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))
                    """, result.purchaseId(), userId, key, itemId, quantity, item.price(), total,
                    result.balanceAfter(), ownedId);
            return result;
        });
    }

    public Equipment equip(long userId, long userItemId) {
        if (userId <= 0 || userItemId <= 0) {
            throw error(400, "INVALID_REQUEST", "보유 아이템을 확인하세요.");
        }
        Equipment result = transactions.execute(status -> {
            lockWallet(userId);
            var matching = owned(userId, false).stream()
                    .filter(value -> value.userItemId() == userItemId && value.quantity() > 0).findFirst();
            if (matching.isEmpty()) {
                throw error(404, "OWNED_ITEM_NOT_FOUND", "보유한 아이템이 없습니다.");
            }
            var selected = matching.get();
            if (selected.item().itemType() != ItemType.EQUIPMENT || selected.item().equipSlot() == null) {
                throw error(409, "ITEM_NOT_EQUIPPABLE", "장착 가능한 의상이 아닙니다.");
            }
            jdbc.update("""
                    UPDATE user_items ui JOIN items i ON i.id = ui.item_id
                    SET ui.is_equipped = FALSE WHERE ui.user_id = ? AND i.equip_slot = ?
                    """, userId, selected.item().equipSlot().name());
            jdbc.update("UPDATE user_items SET is_equipped = TRUE WHERE id = ? AND user_id = ?", userItemId, userId);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { equipmentCommitted(userId); }
            });
            return new Equipment(owned(userId, true));
        });
        return result;
    }

    private void equipmentCommitted(long userId) {
        // 외부 트랜잭션에 참여해도 커밋 뒤에만 알린다. 알림 실패는 장착 결과를 되돌리지 않는다.
        try { events.publishEvent(new EquipmentChanged(userId)); }
        catch (RuntimeException exception) {
            System.getLogger(ShopService.class.getName()).log(System.Logger.Level.WARNING,
                    "의상 변경 알림을 전달하지 못했습니다. 보유 목록을 다시 조회할 수 있습니다.");
        }
    }

    private Wallet lockWallet(long userId) {
        var rows = jdbc.query("SELECT id, balance, reserved_balance FROM wallets WHERE user_id = ? FOR UPDATE",
                (row, number) -> new Wallet(row.getLong(1), row.getLong(2), row.getLong(3)), userId);
        if (rows.size() != 1) {
            throw error(409, "WALLET_NOT_READY", "지갑 초기화가 필요합니다.");
        }
        return rows.getFirst();
    }

    private List<OwnedItem> owned(long userId, boolean equippedOnly) {
        return jdbc.query("SELECT " + ITEM_COLUMNS
                + ", ui.id AS user_item_id, ui.quantity, ui.is_equipped FROM user_items ui"
                + " JOIN items i ON i.id = ui.item_id WHERE ui.user_id = ? AND ui.quantity > 0"
                + (equippedOnly ? " AND ui.is_equipped = TRUE" : "") + " ORDER BY ui.id", OWNED, userId);
    }

    private static Item item(ResultSet row) throws SQLException {
        String slot = row.getString("equip_slot");
        return new Item(row.getLong("id"), row.getString("item_code"), row.getString("name"),
                ItemType.valueOf(row.getString("item_type")), slot == null ? null : EquipSlot.valueOf(slot),
                row.getLong("price"), row.getString("image_key"));
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

    private record Wallet(long id, long balance, long reserved) { }
    private record Holding(long id, int quantity) { }
}

