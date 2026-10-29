package com.ssafy.ontop.world.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.security.Principal;
import java.util.Arrays;
import java.util.Collections;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile("local")
@Order(-101)
public class ChannelAccessFilter extends OncePerRequestFilter {

    private final AccessAuthenticationService authentication;
    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;
    private final boolean authenticatedTables;

    public ChannelAccessFilter(AccessAuthenticationService authentication,
            AuthExchangeOriginPolicy origins, ObjectMapper mapper,
            @Value("${ontop.websocket.authenticated:true}") boolean authenticatedTables) {
        this.authentication = authentication;
        this.origins = origins;
        this.mapper = mapper;
        this.authenticatedTables = authenticatedTables;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        boolean protectedQuery = path.equals(request.getContextPath() + "/api/v1/channels")
                || authenticatedTables && path.equals(request.getContextPath() + "/api/v1/tables");
        return !protectedQuery
                || !(request.getMethod().equals("GET") || request.getMethod().equals("OPTIONS"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.addHeader("Vary", "Origin");
        try {
            String origin = origins.allowedOrigin(request);
            if (origin != null) { response.setHeader("Access-Control-Allow-Origin", origin); }
            if (request.getMethod().equals("OPTIONS")) {
                String headers = request.getHeader("Access-Control-Request-Headers");
                if (origin == null || !"GET".equals(request.getHeader("Access-Control-Request-Method"))
                        || headers != null && Arrays.stream(headers.split(","))
                        .anyMatch(header -> !header.trim().equalsIgnoreCase("Authorization"))) {
                    error(response, 403);
                    return;
                }
                response.addHeader("Vary", "Access-Control-Request-Method");
                response.addHeader("Vary", "Access-Control-Request-Headers");
                response.setHeader("Access-Control-Allow-Methods", "GET");
                response.setHeader("Access-Control-Allow-Headers", "Authorization");
                response.setHeader("Cache-Control", "no-store");
                response.setStatus(204);
                return;
            }
        } catch (AuthExchangeException exception) {
            error(response, exception.error().status().value() == 403 ? 403 : 503);
            return;
        }

        var authorization = Collections.list(request.getHeaders("Authorization"));
        if (authorization.isEmpty()) {
            // 기본 REST 모드는 공통 Security entrypoint, 기존 인증 소켓 모드는 기존 오류 계약을 유지한다.
            if (authenticatedTables) { error(response, 401); }
            else { chain.doFilter(request, response); }
            return;
        }
        Principal principal;
        try {
            if (authorization.size() != 1 || !authorization.getFirst().startsWith("Bearer ")) {
                error(response, 401);
                return;
            }
            principal = authentication.authenticate(authorization.getFirst().substring(7));
        } catch (RestAuthenticationException exception) {
            error(response, exception.error().status());
            return;
        } catch (AuthExchangeException exception) {
            error(response, exception.error().status().value() == 401 ? 401 : 503);
            return;
        } catch (RuntimeException exception) {
            error(response, 503);
            return;
        }
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override public Principal getUserPrincipal() { return principal; }
            @Override public String getRemoteUser() { return principal.getName(); }
        }, response);
    }

    private void error(HttpServletResponse response, int status) throws IOException {
        String code = switch (status) {
            case 401 -> "UNAUTHENTICATED";
            case 403 -> "FORBIDDEN";
            default -> "SERVICE_UNAVAILABLE";
        };
        String message = switch (status) {
            case 401 -> "로그인이 필요합니다.";
            case 403 -> "허용되지 않은 요청 출처입니다.";
            default -> "목록을 확인할 수 없습니다.";
        };
        response.setStatus(status);
        response.setHeader("Cache-Control", "no-store");
        response.setContentType("application/json;charset=UTF-8");
        mapper.writeValue(response.getOutputStream(), new ErrorResponse(code, message, null));
    }

    private record ErrorResponse(String code, String message, Object details) { }
}
