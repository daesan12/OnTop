package com.ssafy.ontop.wallet.repository;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

/** 지갑이 없지만 거래/관련 데이터가 남은 계정을 자동 지급으로 덮어쓰지 않는다. */
@Repository
@Profile("db")
public class WalletInitializationGuard {

    private final EntityManager entities;

    public WalletInitializationGuard(EntityManager entities) {
        this.entities = entities;
    }

    public void verifyNoOrphanTransactions() {
        boolean orphan = !entities.createNativeQuery("""
                SELECT 1 FROM wallet_transactions t LEFT JOIN wallets w ON w.id = t.wallet_id
                WHERE w.id IS NULL LIMIT 1
                """).getResultList().isEmpty();
        if (orphan) {
            throw inconsistent();
        }
    }

    public void verifyNoReferences(long userId) {
        // 실제 존재하는 FK를 조사한다. Refresh 이력은 지갑 도입 전 정상 회원도 가질 수 있다.
        // 과거 FK 없는 Shop/경기 스키마도 user_id 컬럼이 있을 때만 보수적으로 검사한다.
        List<?> references = entities.createNativeQuery("""
                SELECT DISTINCT TABLE_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_SCHEMA = DATABASE()
                  AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'id'
                  AND TABLE_NAME NOT IN ('wallets', 'refresh_tokens')
                UNION
                SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'user_id'
                  AND TABLE_NAME IN ('shop_purchases', 'user_items', 'game_participants', 'minigame_sessions')
                """).getResultList();
        for (Object reference : references) {
            Object[] columns = (Object[]) reference;
            String table = identifier(columns[0]);
            String column = identifier(columns[1]);
            if (!entities.createNativeQuery("SELECT 1 FROM `" + table + "` WHERE `" + column
                    + "` = :userId LIMIT 1").setParameter("userId", userId).getResultList().isEmpty()) {
                throw inconsistent();
            }
        }
    }

    private String identifier(Object value) {
        String identifier = value.toString();
        if (!identifier.matches("[A-Za-z0-9_]+")) {
            throw inconsistent();
        }
        return identifier;
    }

    private DataIntegrityViolationException inconsistent() {
        return new DataIntegrityViolationException("WALLET_INITIALIZATION_REVIEW_REQUIRED: 기존 참조 데이터 확인이 필요합니다.");
    }
}
