package com.ssafy.ontop.wallet.repository;

import com.ssafy.ontop.wallet.domain.Wallet;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WalletRepository extends JpaRepository<Wallet, Long> {

    Optional<Wallet> findByUserId(long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Wallet w where w.userId = :userId")
    Optional<Wallet> findForUpdateByUserId(@Param("userId") long userId);

    @Query("select u.id from User u where u.deletedAt is null and u.id > :after order by u.id")
    List<Long> findActiveMemberIdsAfter(@Param("after") long after, Pageable page);
}
