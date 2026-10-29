package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = AuthRefreshController.class)
public class AuthRefreshExceptionHandler {

    @ExceptionHandler(AuthRefreshException.class)
    public ResponseEntity<AuthErrorResponse> handleRefresh(AuthRefreshException exception) {
        return error(exception.error().status().value(), exception.error().code(), exception.getMessage());
    }

    @ExceptionHandler(AuthExchangeException.class)
    public ResponseEntity<AuthErrorResponse> handleConfiguration(AuthExchangeException exception) {
        return error(exception.error().status().value(), exception.error().code(), exception.getMessage());
    }

    private ResponseEntity<AuthErrorResponse> error(int status, String code, String message) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(new AuthErrorResponse(code, message));
    }
}
