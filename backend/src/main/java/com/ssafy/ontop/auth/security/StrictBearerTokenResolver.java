package com.ssafy.ontop.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

public class StrictBearerTokenResolver implements BearerTokenResolver {

    private final DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        List<String> headers = Collections.list(request.getHeaders(HttpHeaders.AUTHORIZATION));
        if (headers.size() > 1 || (!headers.isEmpty() && headers.getFirst().length() > 8200)) {
            throw invalid();
        }
        String token = delegate.resolve(request);
        if (!headers.isEmpty() && token == null) {
            throw invalid();
        }
        return token;
    }

    private OAuth2AuthenticationException invalid() {
        // Bearer 추출 단계는 OAuth2AuthenticationException을 받아 EntryPoint로 전달한다.
        return new OAuth2AuthenticationException(new OAuth2Error("invalid_token", "Access 인증 형식 오류", null));
    }
}
