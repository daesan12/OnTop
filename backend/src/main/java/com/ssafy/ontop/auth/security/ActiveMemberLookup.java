package com.ssafy.ontop.auth.security;

import java.util.Optional;

@FunctionalInterface
public interface ActiveMemberLookup {
    Optional<AuthenticatedUser> findActive(long userId);
}
