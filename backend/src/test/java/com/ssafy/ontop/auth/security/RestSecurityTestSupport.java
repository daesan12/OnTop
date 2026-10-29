package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** DB 없는 팀원 REST 회귀 테스트에서만 import한다. 실제 JWT/필터를 통과하고 회원 조회만 대체한다. */
@TestConfiguration(proxyBeanMethods = false)
public class RestSecurityTestSupport {

    public static final long USER_ID = 42;

    @Bean
    @Primary
    AuthTokenProperties restFixtureProperties() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        String encoded = Base64.getEncoder().encodeToString(key);
        return new AuthTokenProperties(encoded, "ontop", List.of("http://localhost:8080", "http://127.0.0.1:8080"),
                new AuthTokenProperties.RefreshCookie(true, "Lax", "/api/v1/auth"));
    }

    @Bean
    ActiveMemberLookup fixtureMembers() {
        return (id, sessionId) -> id == USER_ID ? Optional.of(new AuthenticatedUser(id, LoginProvider.SSAFY, TestLoginSessions.ID)) : Optional.empty();
    }

    public static void authenticate(TestRestTemplate http, AccessJwtService jwt) {
        http.getRestTemplate().setInterceptors(List.of((request, body, execution) -> {
            request.getHeaders().setBearerAuth(jwt.issue(USER_ID, TestLoginSessions.ID));
            return execution.execute(request, body);
        }));
    }
}
