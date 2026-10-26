package com.ssafy.ontop.game.repository;

import com.ssafy.ontop.game.domain.GameSession;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GameSessionRepository extends JpaRepository<GameSession, Long> {
    Optional<GameSession> findByStartAttemptId(UUID startAttemptId);

    boolean existsByActiveTableId(String tableId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from GameSession g where g.id = :id")
    Optional<GameSession> findForUpdateById(@Param("id") long id);
}
