package com.ssafy.ontop.game.mole.repository;

import com.ssafy.ontop.game.mole.domain.MoleRound;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** 지갑을 먼저 잠근다. 같은 회원의 START·완료는 지갑 잠금으로 줄을 서므로 판 행은 따로 잠그지 않는다. */
public class MoleRepository {
    private final EntityManager entities;

    public MoleRepository(EntityManager entities) {
        this.entities = entities;
    }

    public Optional<Wallet> lockWallet(long userId) {
        var rows = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        rows.forEach(wallet -> entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE));
        return rows.stream().findFirst();
    }

    public Optional<MoleRound> findByRequest(long userId, String requestKey) {
        return entities.createQuery("select r from MoleRound r where r.userId = :user and r.requestKey = :key",
                        MoleRound.class)
                .setParameter("user", userId).setParameter("key", requestKey).getResultList().stream().findFirst();
    }

    public Optional<MoleRound> findRound(long userId, long roundId) {
        return entities.createQuery("select r from MoleRound r where r.userId = :user and r.id = :id", MoleRound.class)
                .setParameter("user", userId).setParameter("id", roundId).getResultList().stream().findFirst();
    }

    public List<MoleRound> activeRounds(long userId) {
        return entities.createQuery("select r from MoleRound r where r.userId = :user and r.status = :status",
                        MoleRound.class)
                .setParameter("user", userId).setParameter("status", MoleRound.Status.ACTIVE).getResultList();
    }

    public Optional<MoleRound> latestSettled(long userId) {
        return entities.createQuery("select r from MoleRound r where r.userId = :user and r.status = :status "
                        + "order by r.settledAt desc, r.id desc", MoleRound.class)
                .setParameter("user", userId).setParameter("status", MoleRound.Status.SETTLED)
                .setMaxResults(1).getResultList().stream().findFirst();
    }

    public int bestScore(long userId) {
        Integer best = entities.createQuery("select max(r.score) from MoleRound r where r.userId = :user "
                        + "and r.status = :status", Integer.class)
                .setParameter("user", userId).setParameter("status", MoleRound.Status.SETTLED).getSingleResult();
        return best == null ? 0 : best;
    }

    public long earned(long userId, Instant from, Instant until) {
        return MinigameRewardBudget.earned(entities, userId, from, until);
    }

    public void persist(Object entity) {
        entities.persist(entity);
    }

    public void flush() {
        entities.flush();
    }
}
