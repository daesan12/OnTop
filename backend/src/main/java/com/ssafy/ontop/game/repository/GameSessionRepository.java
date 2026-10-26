package com.ssafy.ontop.game.repository;

import com.ssafy.ontop.game.domain.GameSession;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameSessionRepository extends JpaRepository<GameSession, Long> {
    Optional<GameSession> findByStartAttemptId(UUID startAttemptId);

    boolean existsByActiveTableId(String tableId);
}
