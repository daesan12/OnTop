package com.ssafy.ontop.shop.persistence;

import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("local & db")
@ConditionalOnProperty(name = "ontop.shop.enabled", havingValue = "true")
public class ShopRepository {
    private final EntityManager entities;
    public ShopRepository(EntityManager entities) { this.entities = entities; }

    public List<ShopItem> catalog() {
        return entities.createQuery("select i from ShopItem i where i.forSale = true order by i.id", ShopItem.class)
                .getResultList();
    }
    public Optional<Wallet> lockWallet(long userId) {
        var rows = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        // 외부 트랜잭션이 이전에 읽은 지갑도 잠금 획득 뒤 현재 DB 값으로 갱신한다.
        rows.forEach(wallet -> entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE));
        return rows.stream().findFirst();
    }
    public Optional<ShopPurchase> receipt(long userId, String key) {
        return entities.createQuery("select p from ShopPurchase p where p.userId = :user and p.requestKey = :key",
                ShopPurchase.class).setParameter("user", userId).setParameter("key", key)
                .getResultList().stream().findFirst();
    }
    public Optional<ShopItem> saleItem(long itemId) {
        var item = entities.find(ShopItem.class, itemId, LockModeType.PESSIMISTIC_READ);
        if (item != null) { entities.refresh(item, LockModeType.PESSIMISTIC_READ); }
        return Optional.ofNullable(item).filter(ShopItem::forSale);
    }
    public Optional<ShopOwnedItem> holding(long userId, long itemId) {
        var rows = entities.createQuery("select o from ShopOwnedItem o where o.userId = :user and o.item.id = :item",
                ShopOwnedItem.class).setParameter("user", userId).setParameter("item", itemId)
                .getResultList();
        rows.forEach(holding -> entities.refresh(holding, LockModeType.PESSIMISTIC_WRITE));
        return rows.stream().findFirst();
    }
    public List<ShopOwnedItem> owned(long userId) {
        return entities.createQuery("select o from ShopOwnedItem o join fetch o.item where o.userId = :user"
                + " and o.quantity > 0 order by o.id", ShopOwnedItem.class)
                .setParameter("user", userId).getResultList();
    }
    public List<ShopOwnedItem> ownedForUpdate(long userId) {
        var rows = entities.createQuery("select o from ShopOwnedItem o where o.userId = :user"
                + " order by o.id", ShopOwnedItem.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        rows.forEach(holding -> entities.refresh(holding, LockModeType.PESSIMISTIC_WRITE));
        return rows;
    }
    public void persist(Object entity) { entities.persist(entity); }
    public void flush() { entities.flush(); }
}
