package com.ssafy.ontop.game.plusminus.repository;

import com.ssafy.ontop.game.plusminus.domain.PlusMinusRound;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;

/** 지갑을 먼저 잠근다. 같은 회원의 START는 지갑 잠금으로 줄을 서므로 판 행은 따로 잠그지 않는다. */
public class PlusMinusRepository {
    private final EntityManager entities;

    public PlusMinusRepository(EntityManager entities) {
        this.entities = entities;
    }

    public Optional<Wallet> lockWallet(long userId) {
        var rows = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        rows.forEach(wallet -> entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE));
        return rows.stream().findFirst();
    }

    public Optional<PlusMinusRound> findByRequest(long userId, String requestKey) {
        return entities.createQuery("select r from PlusMinusRound r where r.userId = :user and r.requestKey = :key",
                        PlusMinusRound.class)
                .setParameter("user", userId).setParameter("key", requestKey).getResultList().stream().findFirst();
    }

    public Optional<PlusMinusRound> latest(long userId) {
        return entities.createQuery("select r from PlusMinusRound r where r.userId = :user order by r.id desc",
                        PlusMinusRound.class)
                .setParameter("user", userId).setMaxResults(1).getResultList().stream().findFirst();
    }

    public long countPlays(long userId, LocalDate playDate) {
        return entities.createQuery(
                        "select count(r) from PlusMinusRound r where r.userId = :user and r.playDate = :date",
                        Long.class)
                .setParameter("user", userId).setParameter("date", playDate).getSingleResult();
    }

    public void persist(Object entity) {
        entities.persist(entity);
    }

    public void flush() {
        entities.flush();
    }
}
