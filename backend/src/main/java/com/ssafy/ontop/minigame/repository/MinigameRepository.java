package com.ssafy.ontop.minigame.repository;

import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("local & db")
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
public class MinigameRepository {
    private final EntityManager entities;

    public MinigameRepository(EntityManager entities) {
        this.entities = entities;
    }

    public Optional<Wallet> lockWallet(long userId) {
        var rows = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        rows.forEach(wallet -> entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE));
        return rows.stream().findFirst();
    }

    public Optional<MinigameSession> session(long userId, long sessionId, boolean lock) {
        var query = entities.createQuery("select s from MinigameSession s where s.id = :id and s.userId = :user",
                MinigameSession.class).setParameter("id", sessionId).setParameter("user", userId);
        if (lock) {
            query.setLockMode(LockModeType.PESSIMISTIC_WRITE);
        }
        var rows = query.getResultList();
        if (lock) {
            rows.forEach(session -> entities.refresh(session, LockModeType.PESSIMISTIC_WRITE));
        }
        return rows.stream().findFirst();
    }

    public Optional<MinigameStartRequest> startRequest(long userId, String key) {
        return entities.createQuery("select r from MinigameStartRequest r where r.userId = :user"
                + " and r.requestKey = :key", MinigameStartRequest.class)
                .setParameter("user", userId).setParameter("key", key).getResultList().stream().findFirst();
    }

    public void persist(Object entity) { entities.persist(entity); }
    public void flush() { entities.flush(); }
}
