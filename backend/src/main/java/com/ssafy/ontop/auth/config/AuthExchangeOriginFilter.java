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
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

// 이 POST와 해당 preflight에만 적용한다. 기존 REST/OAuth/WebSocket CORS 설정은 건드리지 않는다.
@Component
@Order(-90)
public class AuthExchangeOriginFilter extends OncePerRequestFilter {

    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;

    public AuthExchangeOriginFilter(AuthExchangeOriginPolicy origins, ObjectMapper mapper) {
        this.origins = origins;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().equals(request.getContextPath() + "/api/v1/auth/exchange")
                || (!request.getMethod().equals("POST") && !request.getMethod().equals("OPTIONS"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.addHeader("Vary", "Origin");
        try {
            String origin = origins.allowedOrigin(request);
            if (origin != null) {
                response.setHeader("Access-Control-Allow-Origin", origin);
                response.setHeader("Access-Control-Allow-Credentials", "true");
            }
            if (request.getMethod().equals("OPTIONS")) {
                String headers = request.getHeader("Access-Control-Request-Headers");
                if (origin == null || !"POST".equals(request.getHeader("Access-Control-Request-Method"))
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
