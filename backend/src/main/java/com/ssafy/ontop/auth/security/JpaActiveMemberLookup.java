package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.user.repository.UserRepository;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class JpaActiveMemberLookup implements ActiveMemberLookup {

    private final UserRepository users;

    public JpaActiveMemberLookup(UserRepository users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AuthenticatedUser> findActive(long userId) {
        return users.findById(userId).filter(user -> user.getDeletedAt() == null)
                .map(user -> new AuthenticatedUser(user.getId(), user.getLoginProvider()));
    }
}
