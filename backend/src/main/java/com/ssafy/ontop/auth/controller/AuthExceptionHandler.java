package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthAuthorizeException;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {AuthController.class, AuthCallbackController.class})
public class AuthExceptionHandler {

    @ExceptionHandler(AuthAuthorizeException.class)
    public ResponseEntity<AuthErrorResponse> handleAuthorize(AuthAuthorizeException exception) {
        return ResponseEntity.status(exception.status())
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .body(new AuthErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(AuthCallbackException.class)
    public ResponseEntity<AuthErrorResponse> handleCallback(AuthCallbackException exception) {
        return ResponseEntity.status(exception.error().status()).contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(new AuthErrorResponse(exception.error().code(), exception.getMessage()));
    }
}
