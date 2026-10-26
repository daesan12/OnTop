package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameIdCodec;
import java.sql.SQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.stereotype.Component;

/** 공통 이벤트 한 경로만 정산한다. 게임별 기존 알림은 통신 연결부가 계속 사용한다. */
@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameFinishedPersistenceListener {
    private static final Logger log = LoggerFactory.getLogger(GameFinishedPersistenceListener.class);
    private final GameFinishPersistenceService finishes;
    private final GameSettlementPersistenceService settlements;

    public GameFinishedPersistenceListener(GameFinishPersistenceService finishes, GameSettlementPersistenceService settlements) {
        this.finishes = finishes; this.settlements = settlements;
    }

    @EventListener
    public void finished(GameFinished event) {
        long gameId;
        try { gameId = finishes.accept(event); }
        catch (RuntimeException exception) {
            failed(event, "ACCEPT", exception);
            throw exception;
        }
        try { settlements.settle(gameId); }
        catch (RuntimeException exception) {
            failed(event, "SETTLE", exception);
            throw exception;
        }
    }

    private void failed(GameFinished event, String stage, RuntimeException exception) {
        String gameId = "INVALID", eventId = "INVALID";
        // 검증 실패 입력도 기록하므로 임의 문자열/줄바꿈은 로그에 옮기지 않는다.
        if (event != null) {
            try { gameId = GameIdCodec.format(GameIdCodec.parse(event.gameId())); }
            catch (IllegalArgumentException ignored) { /* 잘못된 원문 식별자는 출력하지 않는다. */ }
            if (!gameId.equals("INVALID") && (gameId + ":finished").equals(event.eventId())) { eventId = event.eventId(); }
        }
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(exception);
        String sqlState = "NONE";
        int sqlErrorCode = 0;
        if (cause instanceof SQLException sql) {
            sqlState = sql.getSQLState() != null && sql.getSQLState().matches("[A-Z0-9]{5}") ? sql.getSQLState() : "UNKNOWN";
            sqlErrorCode = sql.getErrorCode();
        }
        // 예외 메시지/stack trace에는 SQL 값·회원 정보가 섞일 수 있어 타입과 DB 오류 메타데이터만 남긴다.
        // key-value 필드는 구조화 로거에, 같은 텍스트는 기본 콘솔 패턴에서도 조회 가능하도록 제공한다.
        log.atError().addKeyValue("gameId", gameId).addKeyValue("eventId", eventId).addKeyValue("stage", stage)
                .addKeyValue("exceptionType", exception.getClass().getName()).addKeyValue("rootCauseType", cause.getClass().getName())
                .addKeyValue("sqlState", sqlState).addKeyValue("sqlErrorCode", sqlErrorCode)
                .log("경기 종료 영속화 실패 gameId={} eventId={} stage={} exceptionType={} rootCauseType={} sqlState={} sqlErrorCode={}",
                        gameId, eventId, stage, exception.getClass().getName(), cause.getClass().getName(), sqlState, sqlErrorCode);
    }
}
