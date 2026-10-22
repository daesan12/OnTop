package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.RestSecurityErrorHandler;
import com.ssafy.ontop.user.exception.UserNicknameUpdateException;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {UserProfileController.class, UserNicknameUpdateController.class})
public class UserProfileExceptionHandler {

    private final RestSecurityErrorHandler errors;

    public UserProfileExceptionHandler(RestSecurityErrorHandler errors) {
        this.errors = errors;
    }

    @ExceptionHandler(RestAuthenticationException.class)
    public void handleAuthentication(RestAuthenticationException exception, HttpServletResponse response)
            throws IOException {
        var error = exception.error();
        errors.write(response, error.status(), error.code(), error.message());
    }

    @ExceptionHandler(UserOnboardingException.class)
    public void handleNickname(UserOnboardingException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status().value(), error.code(), exception.getMessage());
    }

    @ExceptionHandler(UserNicknameUpdateException.class)
    public void handleUpdate(UserNicknameUpdateException exception, HttpServletResponse response) throws IOException {
        var error = exception.error();
        errors.write(response, error.status().value(), error.code(), exception.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public void handleBody(Exception exception, HttpServletResponse response) throws IOException {
        handleUpdate(new UserNicknameUpdateException(UserNicknameUpdateException.Error.INVALID_REQUEST), response);
    }
}
