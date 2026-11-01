package com.ssafy.ontop.game.rpsroulette.repository;

import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** 지갑 → 판 순서로 잠근다. 같은 회원의 START·행동·정리 작업이 같은 지갑 잠금을 공유한다. */
public class RpsRouletteRepository {
    private final EntityManager entities;

    public RpsRouletteRepository(EntityManager entities) {
        this.entities = entities;
    }

    public Optional<Wallet> lockWallet(long userId) {
        var rows = entities.createQuery("select w from Wallet w where w.userId = :user", Wallet.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
        rows.forEach(wallet -> entities.refresh(wallet, LockModeType.PESSIMISTIC_WRITE));
        return rows.stream().findFirst();
    }

    public Optional<RpsRouletteRound> findByRequest(long userId, String requestKey) {
        return entities.createQuery("select r from RpsRouletteRound r where r.userId = :user and r.requestKey = :key",
                        RpsRouletteRound.class)
                .setParameter("user", userId).setParameter("key", requestKey).getResultList().stream().findFirst();
    }

    public Optional<RpsRouletteRound> lockActive(long userId) {
        return entities.createQuery("select r from RpsRouletteRound r where r.activeUserId = :user",
                        RpsRouletteRound.class)
                .setParameter("user", userId).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList().stream()
                .findFirst();
    }

    public Optional<RpsRouletteRound> lockRound(long userId, long roundId) {
        return entities.createQuery("select r from RpsRouletteRound r where r.id = :id and r.userId = :user",
                        RpsRouletteRound.class)
                .setParameter("id", roundId).setParameter("user", userId)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList().stream().findFirst();
    }

    public Optional<RpsRouletteRound> latest(long userId) {
        return entities.createQuery("select r from RpsRouletteRound r where r.userId = :user order by r.id desc",
                        RpsRouletteRound.class)
                .setParameter("user", userId).setMaxResults(1).getResultList().stream().findFirst();
    }

    public long countPlays(long userId, LocalDate playDate) {
        return entities.createQuery(
                        "select count(r) from RpsRouletteRound r where r.userId = :user and r.playDate = :date",
                        Long.class)
                .setParameter("user", userId).setParameter("date", playDate).getSingleResult();
    }

    /** 정리 작업 후보. 실제 처리는 회원별 트랜잭션에서 지갑과 판을 다시 잠근 뒤 확인한다. */
    public List<Long> expiredUserIds(Instant now, int limit) {
        return entities.createQuery("select r.userId from RpsRouletteRound r "
                        + "where r.phase <> com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRound.Phase.SETTLED "
                        + "and r.deadlineAt < :now order by r.deadlineAt", Long.class)
                .setParameter("now", now).setMaxResults(limit).getResultList();
    }

    public void persist(Object entity) {
        entities.persist(entity);
    }

    public void flush() {
        entities.flush();
    }
}
