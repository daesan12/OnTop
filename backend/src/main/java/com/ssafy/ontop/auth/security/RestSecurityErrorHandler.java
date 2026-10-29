package com.ssafy.ontop.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

@Component
public class RestSecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper mapper;

    public RestSecurityErrorHandler(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        RestAuthenticationException.Error error = exception instanceof RestAuthenticationException failure
                ? failure.error() : exception instanceof InsufficientAuthenticationException
                ? RestAuthenticationException.Error.REQUIRED : RestAuthenticationException.Error.INVALID;
        write(response, error.status(), error.code(), error.message());
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
            throws IOException {
        var error = RestAuthenticationException.Error.FORBIDDEN;
        write(response, error.status(), error.code(), error.message());
    }

    public void write(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        if (status == 401) {
            response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        }
        mapper.writeValue(response.getOutputStream(), new AuthErrorResponse(code, message));
    }
}
