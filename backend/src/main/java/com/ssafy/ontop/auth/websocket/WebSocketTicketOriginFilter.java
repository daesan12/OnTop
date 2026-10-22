package com.ssafy.ontop.auth.websocket;

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
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile("local")
@ConditionalOnProperty(name = "ontop.websocket.authenticated", havingValue = "true")
@Order(-101)
public class WebSocketTicketOriginFilter extends OncePerRequestFilter {

    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;

    public WebSocketTicketOriginFilter(AuthExchangeOriginPolicy origins, ObjectMapper mapper) {
        this.origins = origins;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().equals(request.getContextPath() + "/api/v1/auth/websocket-ticket");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.addHeader("Vary", "Origin");
        try {
            String origin = origins.allowedOrigin(request);
            if (origin != null) { response.setHeader("Access-Control-Allow-Origin", origin); }
            if (request.getMethod().equals("OPTIONS")) {
                String headers = request.getHeader("Access-Control-Request-Headers");
                if (origin == null || !"POST".equals(request.getHeader("Access-Control-Request-Method"))
                        || headers != null && Arrays.stream(headers.split(","))
                        .anyMatch(header -> !header.trim().equalsIgnoreCase("Authorization"))) {
                    throw new AuthExchangeException(AuthExchangeException.Error.ORIGIN_DENIED);
                }
                response.addHeader("Vary", "Access-Control-Request-Method");
                response.addHeader("Vary", "Access-Control-Request-Headers");
                response.setHeader("Access-Control-Allow-Methods", "POST");
                response.setHeader("Access-Control-Allow-Headers", "Authorization");
                response.setStatus(HttpServletResponse.SC_NO_CONTENT);
                return;
            }
        } catch (AuthExchangeException exception) {
            response.setStatus(exception.error().status().value());
            response.setContentType("application/json;charset=UTF-8");
            mapper.writeValue(response.getOutputStream(),
                    new AuthErrorResponse(exception.error().code(), exception.getMessage()));
            return;
        }
        chain.doFilter(request, response);
    }
}
