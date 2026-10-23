package com.ssafy.ontop.minigame.repository;

import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.domain.MinigameStartRequest;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
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

    public Optional<BungeoppangRecord> record(long sessionId) {
        return Optional.ofNullable(entities.find(BungeoppangRecord.class, sessionId));
    }

    public BungeoppangProfile profile(long userId) {
        var profile = entities.find(BungeoppangProfile.class, userId);
        if (profile == null) { profile = new BungeoppangProfile(userId); entities.persist(profile); }
        return profile;
    }

    public List<MinigameSession> playing(long userId) {
        return entities.createQuery("select s from MinigameSession s where s.userId = :user and s.status = 'PLAYING'",
                MinigameSession.class).setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList();
    }

    public boolean firstGame(long userId) {
        return entities.createQuery("select count(s) from MinigameSession s where s.userId = :user"
                + " and s.status = 'COMPLETED'", Long.class).setParameter("user", userId).getSingleResult() == 0;
    }

    public long startsSince(long userId, Instant from) {
        return entities.createQuery("select count(s) from MinigameSession s where s.userId = :user"
                + " and s.startedAt > :from", Long.class).setParameter("user", userId)
                .setParameter("from", from).getSingleResult();
    }

    public long earned(long userId, Instant from, Instant until) {
        return entities.createQuery("select coalesce(sum(s.rewardAmount), 0) from MinigameSession s"
                + " where s.userId = :user and s.status = 'COMPLETED' and s.endedAt >= :from and s.endedAt < :until",
                Long.class).setParameter("user", userId).setParameter("from", from).setParameter("until", until)
                .getSingleResult();
    }
}
