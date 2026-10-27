package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.start.GameIdCodec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 경기 행 잠금으로 최종 판정과 직렬화한다. 이탈만으로 참가비를 해제하지 않는다. */
@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameParticipantLeftPersistenceService {
    private final GameSessionRepository sessions;
    private final GameParticipantRepository participants;

    public GameParticipantLeftPersistenceService(GameSessionRepository sessions,
            GameParticipantRepository participants) {
        this.sessions = sessions;
        this.participants = participants;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public void accept(GameParticipantLeft event) {
        long gameId = GameIdCodec.parse(event.gameId());
        byte[] hash = VerifiedGameDeparture.hash(event);
        if (event.userId() <= 0 || event.version() < 0 || event.version() > 9_007_199_254_740_991L
                || event.leaveReason() == null || event.leftAt() == null
                || !(gameId + ":left:" + event.userId()).equals(event.eventId())) {
            throw new IllegalArgumentException("경기 이탈 이벤트를 확인하세요.");
        }
        GameSession game = sessions.findForUpdateById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("확정된 경기가 없습니다."));
        if (!game.tableId().equals(event.tableId()) || !game.gameCode().equals(event.gameCode())
                || game.reservedAt() == null || event.leftAt().isBefore(game.reservedAt())
                || game.engineFinishVersion() != null && event.version() > game.engineFinishVersion()) {
            throw new IllegalArgumentException("확정된 경기와 이탈 정보가 다릅니다.");
        }
        GameParticipant player = participants.findByGameSessionIdOrderByParticipantOrder(gameId).stream()
                .filter(participant -> participant.userId() == event.userId()).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("최초 경기 참가자가 아닙니다."));
        boolean terminal = game.status() == GameSession.Status.FINISHED || game.status() == GameSession.Status.INVALID;
        if (terminal && (player.leaveReason() == null || player.leftAt() == null
                || player.leaveReason() != event.leaveReason()
                || !player.leftAt().equals(VerifiedGameFinish.millis(event.leftAt())))) {
            throw new IllegalStateException("저장된 최종 판정과 이탈 정보가 다릅니다.");
        }
        player.recordDeparture(event.leaveReason(), event.leftAt(), event.version(), hash);
        participants.flush();
    }
}
