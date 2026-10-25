package com.ssafy.ontop.game.repository;

import com.ssafy.ontop.game.domain.GameParticipant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameParticipantRepository extends JpaRepository<GameParticipant, Long> {
    List<GameParticipant> findByGameSessionIdOrderByParticipantOrder(long gameSessionId);

    boolean existsByActiveUserId(long userId);
}
