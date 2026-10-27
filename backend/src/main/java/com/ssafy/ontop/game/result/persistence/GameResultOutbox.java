package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.start.GameIdCodec;
import java.nio.ByteBuffer;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 금전 트랜잭션과 동일 커밋으로 저장한다. 전달 lease는 게임 실행 소유권과 무관하다. */
@Repository
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameResultOutbox {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Clock clock;

    public GameResultOutbox(JdbcTemplate jdbc, ObjectMapper mapper, @Qualifier("oauthClock") Clock clock) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void stage(GameResultsReady event) {
        var payload = GameResultOutboxPayload.from(event);
        var result = payload.results().getFirst();
        String json;
        try {
            json = mapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("경기 결과 알림을 보관할 수 없습니다.");
        }
        var now = Timestamp.from(clock.instant());
        jdbc.update("""
                INSERT INTO game_result_outbox(game_session_id,result_version,payload,next_attempt_at,created_at)
                VALUES (?,?,?,?,?)
                """, GameIdCodec.parse(result.gameSessionId()), result.version(), json, now, now);
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public List<Long> due(int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("알림 조회 범위를 확인하세요.");
        }
        var now = Timestamp.from(clock.instant());
        return jdbc.queryForList("""
                SELECT id FROM game_result_outbox WHERE delivered_at IS NULL AND next_attempt_at<=?
                AND (locked_until IS NULL OR locked_until<=?) ORDER BY id LIMIT ?
                """, Long.class, now, now, limit);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Claim> claim(long id) {
        var now = clock.instant();
        UUID token = UUID.randomUUID();
        int changed = jdbc.update("""
                UPDATE game_result_outbox SET lock_token=?,locked_until=?,attempt_count=attempt_count+1
                WHERE id=? AND delivered_at IS NULL AND next_attempt_at<=?
                AND (locked_until IS NULL OR locked_until<=?) AND attempt_count<2147483647
                """, bytes(token), Timestamp.from(now.plusSeconds(30)), id, Timestamp.from(now), Timestamp.from(now));
        if (changed == 0) {
            return Optional.empty();
        }
        return Optional.of(jdbc.queryForObject("SELECT payload,attempt_count FROM game_result_outbox WHERE id=?",
                (row, index) -> new Claim(id, token, row.getString(1), row.getInt(2)), id));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void delivered(Claim claim) {
        if (jdbc.update("""
                UPDATE game_result_outbox SET delivered_at=?,lock_token=NULL,locked_until=NULL,
                last_failure_category=NULL WHERE id=? AND lock_token=? AND delivered_at IS NULL
                """, Timestamp.from(clock.instant()), claim.id(), bytes(claim.token())) != 1) {
            throw new IllegalStateException("결과 알림 전달 소유권이 변경되었습니다.");
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(Claim claim, RuntimeException exception) {
        long seconds = Math.min(30, 1L << Math.min(5, claim.attempt()));
        String category = exception.getClass().getSimpleName();
        jdbc.update("""
                UPDATE game_result_outbox SET lock_token=NULL,locked_until=NULL,next_attempt_at=?,last_failure_category=?
                WHERE id=? AND lock_token=? AND delivered_at IS NULL
                """, Timestamp.from(clock.instant().plusSeconds(seconds)), category.substring(0, Math.min(120, category.length())),
                claim.id(), bytes(claim.token()));
    }

    GameResultOutboxPayload decode(Claim claim) {
        return decode(claim.payload());
    }

    private GameResultOutboxPayload decode(String payload) {
        try {
            return mapper.readValue(payload, GameResultOutboxPayload.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("보관된 경기 결과 알림을 확인하세요.");
        }
    }

    private static byte[] bytes(UUID value) {
        return ByteBuffer.allocate(16).putLong(value.getMostSignificantBits()).putLong(value.getLeastSignificantBits()).array();
    }

    public record Claim(long id, UUID token, String payload, int attempt) { }
}
