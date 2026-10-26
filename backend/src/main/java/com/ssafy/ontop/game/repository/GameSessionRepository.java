package com.ssafy.ontop.game.repository;

import com.ssafy.ontop.game.domain.GameSession;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface GameSessionRepository extends JpaRepository<GameSession, Long> {
    Optional<GameSession> findByStartAttemptId(UUID startAttemptId);

    boolean existsByActiveTableId(String tableId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from GameSession g where g.id = :id")
    Optional<GameSession> findForUpdateById(@Param("id") long id);

    @Transactional(readOnly = true)
    @Query("""
            select g.id from GameSession g
            where g.id > :afterId and g.status in :statuses and g.settlementStatus = :settlement
            order by g.id
            """)
    List<Long> findPendingTerminalIds(@Param("afterId") long afterId,
            @Param("statuses") Set<GameSession.Status> statuses,
            @Param("settlement") GameSession.SettlementStatus settlement, Pageable pageable);
}
