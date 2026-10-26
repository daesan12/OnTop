package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** outbox 도입 전 종결 경기에도 사용한다. 읽기만 하며 금전 처리를 재실행하지 않는다. */
@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameStoredRoundQuery {
    private final GameSessionRepository sessions;
    private final GameParticipantRepository participants;

    public GameStoredRoundQuery(GameSessionRepository sessions, GameParticipantRepository participants) {
        this.sessions = sessions;
        this.participants = participants;
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, isolation = Isolation.REPEATABLE_READ)
    public Optional<GameResultOutboxPayload> currentRound(long gameId, GameRuntimeIdentity identity) {
        var found = sessions.findById(gameId);
        if (found.isEmpty()) { return Optional.empty(); }
        var game = found.get();
        if (!game.ownedBy(identity.instanceId(), identity.bootId())
                || game.status() != GameSession.Status.FINISHED && game.status() != GameSession.Status.INVALID) {
            return Optional.empty();
        }
        var players = participants.findByGameSessionIdOrderByParticipantOrder(gameId);
        if (players.size() != game.participantCount()) {
            throw new IllegalStateException("저장된 최초 참가자 수가 다릅니다.");
        }
        return Optional.of(GameResultOutboxPayload.from(new GameResultsReady(game.tableId(), players.stream()
                .map(player -> StoredGameResult.forMember(game, players, player)).toList())));
    }
}
