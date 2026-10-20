package com.ssafy.ontop.user.repository;

import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByLoginProviderAndProviderUserId(LoginProvider loginProvider, String providerUserId);

    boolean existsByNickname(String nickname);
}
