package com.ssafy.ontop.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.DefaultCorsProcessor;
import org.springframework.web.filter.CorsFilter;

// Security의 보호 REST 체인에만 등록한다. 기존 네 개 Origin 필터의 Credentials 계약은 유지한다.
public class RestCorsFilter extends CorsFilter {

    private final RestSecurityErrorHandler errors;

    public RestCorsFilter(AuthExchangeOriginPolicy origins, ObjectMapper mapper,
            RestSecurityErrorHandler errors) {
        super(request -> {
            String origin = origins.allowedOrigin(request);
            CorsConfiguration config = new CorsConfiguration();
            config.setAllowedOrigins(origin == null ? List.of() : List.of(origin));
            config.setAllowedMethods(List.of("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
            config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
            config.setAllowCredentials(false);
            config.setMaxAge(600L);
            return config;
        });
        this.errors = errors;
        setCorsProcessor(new DefaultCorsProcessor() {
            @Override
            protected void rejectRequest(ServerHttpResponse response) throws IOException {
                response.setStatusCode(HttpStatus.FORBIDDEN);
                response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                response.getHeaders().setCacheControl("no-store");
                mapper.writeValue(response.getBody(), new AuthErrorResponse("AUTH_ORIGIN_NOT_ALLOWED",
                        "허용되지 않은 요청 출처입니다."));
                response.flush();
            }
        });
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            super.doFilterInternal(request, response, chain);
        } catch (AuthExchangeException exception) {
            errors.write(response, exception.error().status().value(), exception.error().code(),
                    exception.getMessage());
        }
    }
}
