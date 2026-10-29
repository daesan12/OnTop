package com.ssafy.ontop.auth.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Set;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(-90)
public class AuthRefreshOriginFilter extends OncePerRequestFilter {

    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;

    public AuthRefreshOriginFilter(AuthExchangeOriginPolicy origins, ObjectMapper mapper) {
        this.origins = origins;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().equals(request.getContextPath() + "/api/v1/auth/refresh")
                || (!request.getMethod().equals("POST") && !request.getMethod().equals("OPTIONS"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.addHeader("Vary", "Origin");
        response.addHeader("Vary", "Sec-Fetch-Site");
        try {
            String origin = origins.allowedOrigin(request);
            String fetchSite = request.getHeader("Sec-Fetch-Site");
            // 교환 코드와 달리 쿠키만 인증에 사용한다. Origin 없는 요청에도 허용 목록 검증을 생략하지 않는다.
            if (origin == null || (fetchSite != null
                    && !Set.of("same-origin", "same-site", "cross-site", "none").contains(fetchSite))) {
                throw new AuthExchangeException(AuthExchangeException.Error.ORIGIN_DENIED);
            }
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Access-Control-Allow-Credentials", "true");
            if (request.getMethod().equals("OPTIONS")) {
                String headers = request.getHeader("Access-Control-Request-Headers");
                if (!"POST".equals(request.getHeader("Access-Control-Request-Method"))
                        || (headers != null && Arrays.stream(headers.split(","))
                        .anyMatch(header -> !header.trim().equalsIgnoreCase("Content-Type")))) {
                    throw new AuthExchangeException(AuthExchangeException.Error.ORIGIN_DENIED);
                }
                response.addHeader("Vary", "Access-Control-Request-Method");
                response.addHeader("Vary", "Access-Control-Request-Headers");
                response.setHeader("Access-Control-Allow-Methods", "POST");
                response.setHeader("Access-Control-Allow-Headers", "Content-Type");
                response.setHeader("Access-Control-Max-Age", "600");
                response.setStatus(HttpServletResponse.SC_NO_CONTENT);
                return;
            }
        } catch (AuthExchangeException exception) {
            response.setStatus(exception.error().status().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), new AuthErrorResponse(exception.error().code(),
                    exception.getMessage()));
            return;
        }
        chain.doFilter(request, response);
    }
}
