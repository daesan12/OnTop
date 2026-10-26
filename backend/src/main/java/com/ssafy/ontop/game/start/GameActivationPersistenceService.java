package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameActivationPersistenceService {
    private final GameSessionRepository sessions;
    private final GameRuntimeIdentity identity;
    private final Clock clock;

    public GameActivationPersistenceService(GameSessionRepository sessions, GameRuntimeIdentity identity,
            @Qualifier("oauthClock") Clock clock) {
        this.sessions = sessions;
        this.identity = identity;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public boolean authorize(GameStartCommand command, String gameId) {
        GameSession game = locked(command, gameId);
        return game.canActivate();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public void started(GameStartCommand command, String gameId) {
        GameSession game = locked(command, gameId);
        // 생성 직후 이미 종료된 엔진 판정을 RUNNING으로 되돌리지 않는다.
        if (game.canActivate()) {
            game.markStarted(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS));
            sessions.flush();
        }
    }

    private GameSession locked(GameStartCommand command, String gameId) {
        var game = sessions.findForUpdateById(GameIdCodec.parse(gameId))
                .orElseThrow(() -> new IllegalStateException("예약된 경기가 없습니다."));
        if (!game.startAttemptId().equals(command.startAttemptId())
                || !game.matches(GameReservationRequest.from(command).fingerprint())
                || !game.ownedBy(identity.instanceId(), identity.bootId())) {
            throw new IllegalStateException("경기 실행 주체 또는 예약 정보가 다릅니다.");
        }
        return game;
    }
}
