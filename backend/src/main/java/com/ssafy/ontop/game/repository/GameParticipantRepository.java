package com.ssafy.ontop.game.repository;

import com.ssafy.ontop.game.domain.GameParticipant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GameParticipantRepository extends JpaRepository<GameParticipant, Long> {
    List<GameParticipant> findByGameSessionIdOrderByParticipantOrder(long gameSessionId);

    boolean existsByActiveUserId(long userId);

    @Query("""
            select g from GameParticipant p, GameSession g
            where p.activeUserId = :userId and g.id = p.gameSessionId
            """)
    Optional<com.ssafy.ontop.game.domain.GameSession> findActiveGameByUserId(@Param("userId") long userId);
}
