package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage.Item;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** 기존의 같은 트랜잭션에서 확정된 세션/라운드/결과만 읽는다. 별도 최고 기록 쓰기는 하지 않는다. */
@Repository
@Profile("db")
public class BungeoppangRankingRepository {
    private final EntityManager entities;
    public BungeoppangRankingRepository(EntityManager entities) { this.entities = entities; }

    @Transactional(readOnly = true)
    public List<Item> personalBests(String version) {
        List<?> rows = entities.createNativeQuery("""
                WITH completed AS (
                    SELECT s.id AS session_id, s.user_id, u.nickname, r.settled_at,
                           JSON_EXTRACT(IF(JSON_VALID(b.result_json), b.result_json, '{}'), '$.made') AS made_json,
                           JSON_EXTRACT(IF(JSON_VALID(b.result_json), b.result_json, '{}'), '$.failed') AS failed_json
                    FROM minigame_sessions s
                    JOIN bungeoppang_records b ON b.minigame_session_id=s.id
                    JOIN bungeoppang_v4_rounds r ON r.minigame_session_id=s.id
                    JOIN users u ON u.id=s.user_id
                    WHERE s.minigame_type='BUNGEOPPANG' AND s.status='COMPLETED' AND s.ended_at IS NOT NULL
                      AND r.terminal_reason='VERIFIED' AND r.settled_at IS NOT NULL
                      AND b.rules_version=:version AND u.deleted_at IS NULL
                ), scores AS (
                    SELECT session_id, user_id, nickname, settled_at,
                           CAST(JSON_UNQUOTE(made_json) AS UNSIGNED) AS made,
                           CAST(JSON_UNQUOTE(failed_json) AS UNSIGNED) AS failed
                    FROM completed
                    WHERE JSON_TYPE(made_json)='INTEGER' AND JSON_TYPE(failed_json)='INTEGER'
                      AND JSON_UNQUOTE(made_json) REGEXP '^[0-9]{1,10}$'
                      AND JSON_UNQUOTE(failed_json) REGEXP '^[0-9]{1,10}$'
                ), choices AS (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id
                        ORDER BY made DESC, failed ASC, settled_at ASC, session_id ASC) AS choice
                    FROM scores
                )
                SELECT RANK() OVER (ORDER BY made DESC, failed ASC) AS place,
                       user_id, nickname, made, failed, settled_at
                FROM choices WHERE choice=1
                ORDER BY made DESC, failed ASC, settled_at ASC, user_id ASC
                """, Object[].class).setParameter("version", version).setMaxResults(10_001).getResultList();
        return rows.stream().map(value -> {
            Object[] row = (Object[]) value;
            return new Item(((Number)row[0]).longValue(), row[1].toString(), (String)row[2],
                    ((Number)row[3]).longValue(), ((Number)row[4]).longValue(), ((Timestamp)row[5]).toInstant());
        }).toList();
    }
}
