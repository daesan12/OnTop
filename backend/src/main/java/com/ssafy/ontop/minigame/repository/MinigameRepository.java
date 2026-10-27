package com.ssafy.ontop.minigame.repository;

import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Order;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Progress;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Receipt;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
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
@Profile("(local | dev) & db & !prod & !production")
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

    public Optional<BungeoppangV4Round> v4Round(long sessionId, boolean lock) {
        var query = entities.createQuery("select r from BungeoppangV4Round r where r.sessionId = :session",
                BungeoppangV4Round.class).setParameter("session", sessionId);
        if (lock) { query.setLockMode(LockModeType.PESSIMISTIC_WRITE); }
        var rows = query.getResultList();
        if (lock) { rows.forEach(round -> entities.refresh(round, LockModeType.PESSIMISTIC_WRITE)); }
        return rows.stream().findFirst();
    }

    public List<BungeoppangV4Order> v4Orders(long sessionId) {
        return entities.createQuery("select o from BungeoppangV4Order o where o.sessionId = :session"
                + " order by o.orderIndex", BungeoppangV4Order.class)
                .setParameter("session", sessionId).getResultList();
    }

    public Optional<BungeoppangV4Progress> v4Progress(long sessionId, boolean lock) {
        var query = entities.createQuery("select p from BungeoppangV4Progress p where p.sessionId = :session",
                BungeoppangV4Progress.class).setParameter("session", sessionId);
        if (lock) { query.setLockMode(LockModeType.PESSIMISTIC_WRITE); }
        var rows = query.getResultList();
        if (lock) { rows.forEach(progress -> entities.refresh(progress, LockModeType.PESSIMISTIC_WRITE)); }
        return rows.stream().findFirst();
    }

    public Optional<BungeoppangV4Receipt> v4Receipt(long sessionId, String operation, String key) {
        return entities.createQuery("select r from BungeoppangV4Receipt r where r.sessionId = :session"
                        + " and r.operation = :operation and r.requestKey = :key", BungeoppangV4Receipt.class)
                .setParameter("session", sessionId).setParameter("operation", operation)
                .setParameter("key", key).getResultList().stream().findFirst();
    }

    public Optional<BungeoppangV4Receipt> acceptedV4Delivery(long sessionId, long orderId) {
        return entities.createQuery("select r from BungeoppangV4Receipt r where r.sessionId = :session"
                        + " and r.operation = 'DELIVERY' and r.acceptedOrderId = :order", BungeoppangV4Receipt.class)
                .setParameter("session", sessionId).setParameter("order", orderId)
                .getResultList().stream().findFirst();
    }

    public BungeoppangProfile profile(long userId) {
        var profile = entities.find(BungeoppangProfile.class, userId);
        if (profile == null) { profile = new BungeoppangProfile(userId); entities.persist(profile); }
        return profile;
    }

    public List<MinigameSession> playing(long userId) {
        return entities.createQuery("select s from MinigameSession s where s.userId = :user and s.status = 'PLAYING'"
                + " order by s.id",
                MinigameSession.class).setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE)
                .getResultList();
    }

    public boolean firstGame(long userId) {
        return entities.createQuery("select count(s) from MinigameSession s where s.userId = :user"
                + " and s.status = 'COMPLETED'", Long.class).setParameter("user", userId).getSingleResult() == 0;
    }

    public long startsSince(long userId, Instant from) {
        Number count = (Number) entities.createNativeQuery("""
                SELECT COUNT(*)
                FROM minigame_sessions s
                LEFT JOIN bungeoppang_v4_rounds v4 ON v4.minigame_session_id = s.id
                WHERE s.user_id = :user AND COALESCE(v4.issued_at, s.started_at) > :from
                """).setParameter("user", userId).setParameter("from", from).getSingleResult();
        return count.longValue();
    }

    public long earned(long userId, Instant from, Instant until) {
        return entities.createQuery("select coalesce(sum(s.rewardAmount), 0) from MinigameSession s"
                + " where s.userId = :user and s.status = 'COMPLETED' and s.endedAt >= :from and s.endedAt < :until",
                Long.class).setParameter("user", userId).setParameter("from", from).setParameter("until", until)
                .getSingleResult();
    }
}
