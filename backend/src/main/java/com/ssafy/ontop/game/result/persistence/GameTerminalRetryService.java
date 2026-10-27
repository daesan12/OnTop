package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

/** DB에 종결이 확정된 경기만 재처리한다. 실행 중 경기의 엔진 유실을 추정하지 않는다. */
@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameTerminalRetryService {
    private static final Logger log = LoggerFactory.getLogger(GameTerminalRetryService.class);
    private final GameSessionRepository sessions;
    private final GameSettlementPersistenceService settlements;

    public GameTerminalRetryService(GameSessionRepository sessions, GameSettlementPersistenceService settlements) {
        this.sessions = sessions;
        this.settlements = settlements;
    }

    public Batch retryPending(long afterId, int limit) {
        if (afterId < 0 || limit < 1 || limit > 100) {
            throw new IllegalArgumentException("경기 재시도 조회 범위를 확인하세요.");
        }
        var ids = sessions.findPendingTerminalIds(afterId,
                Set.of(GameSession.Status.FINISHED, GameSession.Status.INVALID),
                GameSession.SettlementStatus.PENDING, PageRequest.of(0, limit));
        int completed = 0;
        for (long id : ids) {
            try {
                // 별도 프록시의 REQUIRES_NEW가 경기마다 커밋/롤백을 완료한다.
                settlements.settle(id);
                completed++;
            } catch (RuntimeException exception) {
                log.warn("경기 종결 재시도 실패 gameId={} exceptionType={}", id, exception.getClass().getName());
            }
        }
        // 실패 행도 지나가 다음 경기 처리를 막지 않는다. 다음 순회에서 같은 멱등 키로 다시 처리한다.
        return new Batch(ids.isEmpty() ? 0 : ids.getLast(), completed, ids.size() - completed);
    }

    public record Batch(long nextAfterId, int completed, int failed) { }
}
