package com.ssafy.ontop.user.repository;

import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findForAuthenticationById(@Param("id") Long id);

    Optional<User> findByLoginProviderAndProviderUserId(LoginProvider loginProvider, String providerUserId);

    boolean existsByNickname(String nickname);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.loginProvider = :provider and u.providerUserId = :providerUserId")
    Optional<User> findForLogin(@Param("provider") LoginProvider provider,
            @Param("providerUserId") String providerUserId);
}
