package com.ssafy.ontop.game;

import org.springframework.jdbc.core.JdbcTemplate;

/** 기존 원장 조회 테스트의 BIGINT 참조 fixture. 실제 참가비 예약은 Gateway 통합 테스트에서 검증한다. */
public final class TestGameSessions {
    private TestGameSessions() {
    }

    public static void reference(JdbcTemplate jdbc, long id) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM game_sessions WHERE id=?", Integer.class, id) != 0) {
            return;
        }
        jdbc.update("""
                INSERT INTO game_sessions(id,start_attempt_id,request_fingerprint,table_id,table_version,game_code,
                    participant_count,bet_amount_per_player,total_pot,status,settlement_status,
                    owner_instance_id,owner_boot_id,created_at,reserved_at)
                VALUES (?,UUID_TO_BIN(UUID()),UNHEX(REPEAT('00',32)),CONCAT('reference-',UUID()),0,'OMOK',
                    2,1,2,'RESERVED','PENDING','fixture',UUID_TO_BIN(UUID()),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))
                """, id);
    }
}
