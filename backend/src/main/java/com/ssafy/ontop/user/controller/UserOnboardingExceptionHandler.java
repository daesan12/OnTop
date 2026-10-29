package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = UserOnboardingController.class)
public class UserOnboardingExceptionHandler {

    @ExceptionHandler(UserOnboardingException.class)
    public ResponseEntity<AuthErrorResponse> handleOnboarding(UserOnboardingException exception) {
        return error(exception.error().status(), exception.error().code(), exception.getMessage());
    }

    @ExceptionHandler(AuthExchangeException.class)
    public ResponseEntity<AuthErrorResponse> handleAuthentication(AuthExchangeException exception) {
        return error(exception.error().status(), exception.error().code(), exception.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<AuthErrorResponse> handleBody(Exception exception) {
        return handleOnboarding(new UserOnboardingException(UserOnboardingException.Error.INVALID_REQUEST));
    }

    private ResponseEntity<AuthErrorResponse> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(new AuthErrorResponse(code, message));
    }
}
