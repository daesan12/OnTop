package com.ssafy.ontop.raffle.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.config.RuntimeProfiles;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.DefaultCorsProcessor;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnProperty(name = "ontop.raffle.enabled", havingValue = "true")
@Order(-101)
public class RafflePreflightFilter extends OncePerRequestFilter {
    private final AuthExchangeOriginPolicy origins;
    private final ObjectMapper mapper;

    public RafflePreflightFilter(AuthExchangeOriginPolicy origins, ObjectMapper mapper) {
        this.origins = origins;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !request.getMethod().equals("OPTIONS") || !path.equals("/api/v1/raffles/current/tickets");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        try {
            String origin = origins.allowedOrigin(request);
            if (origin == null) {
                forbidden(response);
                return;
            }
            CorsConfiguration cors = new CorsConfiguration();
            cors.setAllowedOrigins(List.of(origin));
            cors.setAllowedMethods(List.of("POST"));
            cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
            cors.setAllowCredentials(false);
            if (new DefaultCorsProcessor().processRequest(cors, request, response)) {
                response.setStatus(204);
            }
        } catch (AuthExchangeException exception) {
            forbidden(response);
        }
    }

    private void forbidden(HttpServletResponse response) throws IOException {
        response.setStatus(403);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), new ErrorResponse("FORBIDDEN",
                "허용되지 않은 요청 출처입니다."));
    }

    private record ErrorResponse(String code, String message) {
    }
}
