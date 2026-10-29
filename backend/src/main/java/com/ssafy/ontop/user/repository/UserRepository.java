package com.ssafy.ontop.user.repository;

import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    @Query("select u from User u where u.id = :id and u.deletedAt is null and exists "
            + "(select r.id from RefreshToken r where r.user.id = u.id and r.sessionId = :sessionId "
            + "and r.revokedAt is null and r.createdAt <= :now and r.expiresAt > :now)")
    Optional<User> findActiveForLoginSession(@Param("id") long id, @Param("sessionId") String sessionId,
            @Param("now") Instant now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findForAuthenticationById(@Param("id") Long id);

    // 회원 상태를 변경하지 않는 예약 경계. Wallet을 먼저 잠그는 구매의 FK 공유 잠금과 호환한다.
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select u from User u where u.id = :id")
    Optional<User> findForGameReservationById(@Param("id") Long id);

    Optional<User> findByLoginProviderAndProviderUserId(LoginProvider loginProvider, String providerUserId);

    boolean existsByNickname(String nickname);

    boolean existsByNicknameAndIdNot(String nickname, Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.loginProvider = :provider and u.providerUserId = :providerUserId")
    Optional<User> findForLogin(@Param("provider") LoginProvider provider,
            @Param("providerUserId") String providerUserId);
}
