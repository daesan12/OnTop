package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.user.repository.UserRepository;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class DatabaseWebSocketAccountLookup implements WebSocketAccountLookup {

    private final UserRepository users;

    public DatabaseWebSocketAccountLookup(UserRepository users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<VerifiedWebSocketUser> findActive(long userId) {
        return users.findById(userId).filter(user -> user.getDeletedAt() == null)
                .map(user -> new VerifiedWebSocketUser(user.getId(),
                        VerifiedWebSocketUser.Provider.valueOf(user.getLoginProvider().name())));
    }
}
