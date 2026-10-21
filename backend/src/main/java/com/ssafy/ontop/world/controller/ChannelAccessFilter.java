package com.ssafy.ontop.world.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.security.Principal;
import java.util.Arrays;
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile("local")
@Order(-88)
public class ChannelAccessFilter extends OncePerRequestFilter {

    private final AccessJwtService jwt;
    private final ObjectProvider<WebSocketAccountLookup> accounts;
    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;

    public ChannelAccessFilter(AccessJwtService jwt, ObjectProvider<WebSocketAccountLookup> accounts,
            AuthExchangeOriginPolicy origins, ObjectMapper mapper) {
        this.jwt = jwt;
        this.accounts = accounts;
        this.origins = origins;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().equals(request.getContextPath() + "/api/v1/channels")
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
            // 기존 서버 인증 Principal 경계는 유지한다. 미인증은 Controller에서 401 처리한다.
            chain.doFilter(request, response);
            return;
        }
        Principal principal;
        try {
            if (authorization.size() != 1 || !authorization.getFirst().startsWith("Bearer ")) {
                error(response, 401);
                return;
            }
            long userId = jwt.verify(authorization.getFirst().substring(7));
            var lookup = accounts.getIfAvailable();
            if (lookup == null) { error(response, 503); return; }
            var user = lookup.findActive(userId).filter(value -> value.userId() == userId);
            if (user.isEmpty()) { error(response, 401); return; }
            principal = () -> Long.toString(userId);
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
            default -> "채널 목록을 확인할 수 없습니다.";
        };
        response.setStatus(status);
        response.setHeader("Cache-Control", "no-store");
        response.setContentType("application/json;charset=UTF-8");
        mapper.writeValue(response.getOutputStream(), new ErrorResponse(code, message, null));
    }

    private record ErrorResponse(String code, String message, Object details) { }
}
