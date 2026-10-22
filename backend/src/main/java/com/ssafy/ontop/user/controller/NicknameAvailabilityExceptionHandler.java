package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = NicknameAvailabilityController.class)
public class NicknameAvailabilityExceptionHandler {

    private final RestSecurityErrorHandler errors;

    public NicknameAvailabilityExceptionHandler(RestSecurityErrorHandler errors) {
        this.errors = errors;
    }

    @ExceptionHandler(RestAuthenticationException.class)
    public void handleAccess(RestAuthenticationException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }

    @ExceptionHandler(AuthExchangeException.class)
    public void handleOnboarding(AuthExchangeException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status().value(), error.code(), exception.getMessage());
    }

    @ExceptionHandler(UserOnboardingException.class)
    public void handleNickname(UserOnboardingException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status().value(), error.code(), exception.getMessage());
    }
}
