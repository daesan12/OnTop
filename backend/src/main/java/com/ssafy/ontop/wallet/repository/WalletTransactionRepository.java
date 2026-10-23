package com.ssafy.ontop.wallet.repository;

import com.ssafy.ontop.wallet.domain.WalletTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, Long> {

    boolean existsByIdempotencyKey(String idempotencyKey);
}
