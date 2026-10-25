package com.ssafy.ontop.game.start;

import java.sql.SQLException;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionException;

@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class JpaGameStartGateway implements GameStartGateway {
    private static final Logger log = LoggerFactory.getLogger(JpaGameStartGateway.class);
    private final GameStartPersistenceService persistence;

    public JpaGameStartGateway(GameStartPersistenceService persistence) {
        this.persistence = persistence;
    }

    @Override
    public GameStartResult startGame(GameStartCommand command) {
        GameReservationRequest request = GameReservationRequest.from(command);
        try {
            return persistence.reserve(request);
        } catch (DataIntegrityViolationException exception) {
            // 실패한 JPA 트랜잭션 안에서 조회하거나 재예약하지 않는다.
            try {
                var previous = persistence.find(command.startAttemptId(), request.fingerprint());
                if (previous.isPresent()) {
                    return previous.get();
                }
                String code = reservationConflict(exception);
                if (code != null) {
                    return persistence.recordConflictRejection(request, code);
                }
            } catch (DataAccessException | TransactionException lookupFailure) {
                report("conflict-lookup", lookupFailure);
            }
            report("reservation-constraint", exception);
        } catch (DataAccessException | TransactionException exception) {
            report("reservation", exception);
        }
        // DB/커밋 실패의 결과를 추정하지 않는다. 호출자는 같은 시도를 조회한다.
        return GameStartResult.pending(command.startAttemptId());
    }

    @Override
    public GameStartResult findStartResult(UUID startAttemptId) {
        Objects.requireNonNull(startAttemptId);
        try {
            return persistence.find(startAttemptId, null).orElseGet(() -> GameStartResult.pending(startAttemptId));
        } catch (DataAccessException | TransactionException exception) {
            report("lookup", exception);
            return GameStartResult.pending(startAttemptId);
        }
    }

    private String reservationConflict(DataIntegrityViolationException exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getErrorCode() == 1062 && sql.getMessage() != null) {
                if (sql.getMessage().contains("uk_game_sessions_active_table")) {
                    return "TABLE_ALREADY_IN_GAME";
                }
                if (sql.getMessage().contains("uk_game_participants_active_user")) {
                    return "MEMBER_ALREADY_IN_GAME";
                }
            }
        }
        return null;
    }

    private void report(String phase, RuntimeException exception) {
        // SQL 예외 원문/파라미터 대신 단계와 예외 분류만 기록한다.
        log.warn("경기 시작 저장소 확인 필요: phase={}, category={}", phase, exception.getClass().getSimpleName());
    }
}
