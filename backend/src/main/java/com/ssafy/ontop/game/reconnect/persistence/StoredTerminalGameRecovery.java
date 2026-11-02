package com.ssafy.ontop.game.reconnect.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.reconnect.ActiveGameRecord;
import com.ssafy.ontop.game.reconnect.TerminalGameRecovery;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.persistence.GameSettlementPersistenceService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 엔진이 사라져도 저장된 본인 결과를 확인하고 기존 정산의 잠금·멱등 처리를 재사용한다. */
@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class StoredTerminalGameRecovery implements TerminalGameRecovery {
    private final GameResultGateway results;
    private final GameSettlementPersistenceService settlements;

    public StoredTerminalGameRecovery(GameResultGateway results, GameSettlementPersistenceService settlements) {
        this.results = results;
        this.settlements = settlements;
    }

    @Override
    public void settleStored(long userId, ActiveGameRecord record) {
        if (record.status() != GameSession.Status.FINISHED && record.status() != GameSession.Status.INVALID) {
            throw new IllegalStateException("저장된 종결 판정이 필요합니다.");
        }
        GameResultView before = loadVerified(userId, record);
        if (before.settlementStatus() == GameResultView.SettlementStatus.PENDING) {
            // 별도 서비스 프록시의 REQUIRES_NEW 커밋이 끝난 뒤 결과를 다시 읽는다.
            settlements.settle(record.gameSessionId());
        }
        if (loadVerified(userId, record).settlementStatus() != GameResultView.SettlementStatus.SETTLED) {
            throw new IllegalStateException("정산 커밋을 확인할 수 없습니다.");
        }
    }

    private GameResultView loadVerified(long userId, ActiveGameRecord record) {
        GameResultView result = results.load(userId, record.gameId())
                .orElseThrow(() -> new IllegalStateException("저장된 본인 경기 결과가 없습니다."));
        if (result.userId() != userId || !result.gameSessionId().equals(record.gameId())
                || !result.gameCode().equals(record.gameCode())
                || !result.status().name().equals(record.status().name())
                || record.endedAt() == null || !record.endedAt().equals(result.endedAt())) {
            throw new IllegalStateException("종결 경기 결과가 일치하지 않습니다.");
        }
        return result;
    }
}
