package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameFinished;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameFinishPersistenceService {
    private final GameSessionRepository sessions;
    private final GameParticipantRepository participants;
    private final ApplicationEventPublisher events;

    public GameFinishPersistenceService(GameSessionRepository sessions, GameParticipantRepository participants,
            ApplicationEventPublisher events) {
        this.sessions = sessions; this.participants = participants; this.events = events;
    }

    /** 판정 수신을 먼저 커밋한다. 정산 실패가 서버의 승패 판정을 지우지 않는다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public long accept(GameFinished event) {
        long id = VerifiedGameFinish.validate(event);
        byte[] hash = VerifiedGameFinish.hash(event);
        GameSession game = sessions.findForUpdateById(id)
                .orElseThrow(() -> new IllegalArgumentException("확정된 경기가 없습니다."));
        if (!game.tableId().equals(event.tableId()) || !game.gameCode().equals(event.gameCode())) {
            throw new IllegalArgumentException("확정된 경기 정보와 다릅니다.");
        }
        if (game.hasFinish()) {
            if (!game.matchesFinish(event.eventId(), hash)) {
                throw new IllegalStateException("이미 저장된 경기 판정과 다릅니다.");
            }
            return id;
        }
        var players = participants.findByGameSessionIdOrderByParticipantOrder(id);
        Map<Long, GameFinished.Participant> outcomes = event.participants().stream()
                .collect(Collectors.toMap(GameFinished.Participant::userId, Function.identity()));
        if (players.size() != game.participantCount() || players.size() != outcomes.size()
                || players.stream().anyMatch(p -> !outcomes.containsKey(p.userId())
                    || p.reservedAmount() != game.betAmountPerPlayer())) {
            throw new IllegalArgumentException("최초 참가자와 예약 금액을 확인하세요.");
        }
        if (VerifiedGameFinish.invalid(event)) {
            game.recordInvalidFinish(event.eventId(), hash, event.version(), event.endReason(),
                    VerifiedGameFinish.millis(event.endedAt()));
        } else {
            var ordered = players.stream().map(p -> outcomes.get(p.userId())).toList();
            if ("STONE_RUMBLE".equals(game.gameCode())) {
                GameSettlementCalculation.stoneRumble(game.betAmountPerPlayer(),
                        ordered.stream().map(GameFinished.Participant::result).toList(),
                        ordered.stream().map(GameFinished.Participant::finishRank).toList());
            } else {
                GameSettlementCalculation.calculate(game.betAmountPerPlayer(), ordered.stream().map(GameFinished.Participant::result).toList());
            }
            game.recordFinish(event.eventId(), hash, event.version(), event.endReason(),
                    VerifiedGameFinish.millis(event.endedAt()));
        }
        players.forEach(p -> p.recordFinish(outcomes.get(p.userId())));
        sessions.flush();
        events.publishEvent(new GameResultsReady(game.tableId(), players.stream()
                .map(p -> StoredGameResult.forMember(game, players, p)).toList()));
        return id;
    }
}
