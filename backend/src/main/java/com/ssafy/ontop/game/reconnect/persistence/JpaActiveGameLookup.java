package com.ssafy.ontop.game.reconnect.persistence;

import com.ssafy.ontop.game.reconnect.ActiveGameLookup;
import com.ssafy.ontop.game.reconnect.ActiveGameRecord;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
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
public class JpaActiveGameLookup implements ActiveGameLookup {
    private final GameParticipantRepository participants;

    public JpaActiveGameLookup(GameParticipantRepository participants) {
        this.participants = participants;
    }

    /** 생성 컬럼 active_user_id의 UNIQUE를 이용해 한 SQL 스냅샷에서 최대 한 경기만 읽는다. */
    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true, isolation = Isolation.READ_COMMITTED)
    public Optional<ActiveGameRecord> findByUserId(long userId) {
        if (userId <= 0) {
            return Optional.empty();
        }
        return participants.findActiveGameByUserId(userId).map(game -> new ActiveGameRecord(
                game.id(), game.gameCode(), game.tableId(), game.status(), game.settlementStatus(),
                game.ownerInstanceId(), game.ownerBootId(), game.reservedAt(), game.startedAt(), game.endedAt()));
    }
}
