package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.user.domain.LoginProvider;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.dao.DataAccessResourceFailureException;

/** 기존 소켓 계정 대역을 공통 REST 회원 조회에도 연결한다. 운영 코드에는 포함하지 않는다. */
@TestConfiguration(proxyBeanMethods = false)
public class MemberAuthenticationFixture {
    @Bean
    ActiveMemberLookup socketFixtureMembers(WebSocketAccountLookup accounts) {
        return id -> {
            try {
                return accounts.findActive(id).map(user -> new AuthenticatedUser(user.userId(),
                        LoginProvider.valueOf(user.provider().name())));
            } catch (RuntimeException exception) {
                throw new DataAccessResourceFailureException("테스트 회원 조회 불가");
            }
        };
    }
}
