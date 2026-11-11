package com.ssafy.ontop.game.mole.repository;

import com.ssafy.ontop.game.mole.domain.MoleRound;
import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.mole.dto.MoleDtos;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.sql.Timestamp;
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

    /** 랭킹과 같은 기준이 되도록 현재 규칙으로 정산한 판만 본다. */
    public int bestScore(long userId) {
        Integer best = entities.createQuery("select max(r.score) from MoleRound r where r.userId = :user "
                        + "and r.status = :status and r.rulesVersion = :version", Integer.class)
                .setParameter("user", userId).setParameter("status", MoleRound.Status.SETTLED)
                .setParameter("version", MoleRules.RULES_VERSION).getSingleResult();
        return best == null ? 0 : best;
    }

    public List<MoleDtos.RankingItem> ranked(int limit, int offset) {
        List<?> rows = entities.createNativeQuery(BESTS
                        + "SELECT * FROM ranked ORDER BY score DESC, max_combo DESC, settled_at ASC, id ASC",
                        Object[].class)
                .setParameter("version", MoleRules.RULES_VERSION)
                .setFirstResult(offset).setMaxResults(limit).getResultList();
        return rows.stream().map(MoleRepository::rankingItem).toList();
    }

    public Optional<MoleDtos.RankingItem> myRanking(long userId) {
        List<?> rows = entities.createNativeQuery(BESTS + "SELECT * FROM ranked WHERE user_id = :user", Object[].class)
                .setParameter("version", MoleRules.RULES_VERSION).setParameter("user", userId).getResultList();
        return rows.stream().findFirst().map(MoleRepository::rankingItem);
    }

    public long participants() {
        return ((Number) entities.createNativeQuery("SELECT COUNT(DISTINCT r.user_id) FROM mole_rounds r "
                        + "JOIN users u ON u.id = r.user_id "
                        + "WHERE r.status = 'SETTLED' AND r.rules_version = :version AND u.deleted_at IS NULL")
                .setParameter("version", MoleRules.RULES_VERSION).getSingleResult()).longValue();
    }

    /** 회원별 최고 기록 하나: 점수 → 최대 콤보 → 먼저 정산. 두 값이 같으면 같은 순위(1,1,3)다. */
    private static final String BESTS = """
            WITH choices AS (
                SELECT r.id, r.user_id, u.nickname, r.score, r.max_combo, r.caught, r.settled_at,
                       ROW_NUMBER() OVER (PARTITION BY r.user_id
                           ORDER BY r.score DESC, r.max_combo DESC, r.settled_at ASC, r.id ASC) AS choice
                FROM mole_rounds r JOIN users u ON u.id = r.user_id
                WHERE r.status = 'SETTLED' AND r.rules_version = :version AND u.deleted_at IS NULL
            ), ranked AS (
                SELECT RANK() OVER (ORDER BY score DESC, max_combo DESC) AS place,
                       id, user_id, nickname, score, max_combo, caught, settled_at
                FROM choices WHERE choice = 1
            )
            """;

    private static MoleDtos.RankingItem rankingItem(Object result) {
        Object[] row = (Object[]) result;
        return new MoleDtos.RankingItem(((Number) row[0]).longValue(), row[2].toString(), (String) row[3],
                ((Number) row[4]).intValue(), ((Number) row[5]).intValue(), ((Number) row[6]).intValue(),
                ((Timestamp) row[7]).toInstant());
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
