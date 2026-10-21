package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthAuthorizeException;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {
        AuthController.class, AuthCallbackController.class, AuthExchangeController.class
})
public class AuthExceptionHandler {

    @ExceptionHandler(AuthExchangeException.class)
    public ResponseEntity<AuthErrorResponse> handleExchange(AuthExchangeException exception) {
        return ResponseEntity.status(exception.error().status()).contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(new AuthErrorResponse(exception.error().code(), exception.getMessage()));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<AuthErrorResponse> handleExchangeBody(Exception exception) {
        return handleExchange(new AuthExchangeException(AuthExchangeException.Error.INVALID_REQUEST));
    }

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
