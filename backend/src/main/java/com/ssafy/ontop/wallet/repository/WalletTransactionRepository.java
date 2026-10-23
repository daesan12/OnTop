package com.ssafy.ontop.wallet.repository;

import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.dto.WalletTransactionResponse;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, Long> {

    boolean existsByIdempotencyKey(String idempotencyKey);

    @Transactional(readOnly = true)
    @Query("""
            select new com.ssafy.ontop.wallet.dto.WalletTransactionResponse(
                t.id, t.transactionType, t.balanceDelta, t.reservedDelta,
                t.itemId, t.gameSessionId, t.minigameSessionId, t.createdAt)
            from WalletTransaction t
            where t.walletId = :walletId and (:cursor is null or t.id < :cursor)
            order by t.id desc
            """)
    List<WalletTransactionResponse> findHistory(@Param("walletId") long walletId,
            @Param("cursor") Long cursor, Pageable page);
}
