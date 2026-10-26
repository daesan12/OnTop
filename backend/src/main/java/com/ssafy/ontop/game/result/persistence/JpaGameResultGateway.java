package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameIdCodec;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class JpaGameResultGateway implements GameResultGateway {
    private final GameSessionRepository sessions;
    private final GameParticipantRepository participants;

    public JpaGameResultGateway(GameSessionRepository sessions, GameParticipantRepository participants) {
        this.sessions = sessions; this.participants = participants;
    }

    // 상태·결과 version·참가 결과를 동일한 DB 스냅샷에서 읽는다. 조회에서 정산하지 않는다.
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Optional<GameResultView> load(long userId, String gameSessionId) {
        long id;
        try { id = GameIdCodec.parse(gameSessionId); }
        catch (IllegalArgumentException exception) { return Optional.empty(); }
        if (userId <= 0) { return Optional.empty(); }
        var found = sessions.findById(id);
        if (found.isEmpty() || found.get().status() != GameSession.Status.FINISHED) { return Optional.empty(); }
        var game = found.get();
        var players = participants.findByGameSessionIdOrderByParticipantOrder(id);
        return players.stream().filter(p -> p.userId() == userId).findFirst()
                .map(me -> StoredGameResult.forMember(game, players, me));
    }
}
